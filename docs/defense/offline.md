# Defensa: sala de partido y cola offline (Fase 9)

## Qué hace y flujo
1. **Entrar** (`mobile/app/match/[id].tsx`): botón "Entrar a la sala" en Inicio/Calendario si mi partido está ACTIVE o PENDING_CONFIRMATION (`canEnterRoom`). `useLandscapeLock` bloquea horizontal al montar y vuelve a vertical al salir. Carga `GET /matches/{id}` (con eventos) y `GET /me/squad`, ambas en la caché persistida.
2. **Registrar un evento** (`EventModal` -> `submitEvent`): elijo Gol/Amarilla/Roja, jugador (de MI plantilla) y minuto. La app genera un UUID (`expo-crypto`) y llama `eventQueue.enqueue(...)`: el evento se guarda en AsyncStorage **antes** de continuar. Después `flushQueue()` intenta enviarlo. El camino es el mismo con y sin red.
3. **Envío** (`offline/eventQueue.ts`): FIFO, de uno en uno, `POST /matches/{id}/events` con ese `id`. 201 o 200 ("ya estaba") -> se borra de la cola. Fallo de red/5xx/401/408/429 -> se queda y se para (el orden se conserva) y `offline/queue.ts` reintenta con backoff 2-30 s. 4xx definitivo (`MATCH_NOT_ACTIVE`, `NOT_YOUR_TEAM`...) -> pasa a "rechazados" (visible en la lista) y NO bloquea a los demás.
4. **Disparadores del envío** (`realtime/useAppRuntime.ts`): vuelve la red (NetInfo), `AUTH_OK` del WebSocket, la app vuelve a primer plano, arranque con sesión, y el backoff.
5. **Lo que se ve** (`features/match/derive.ts::mergeEvents`): eventos del servidor + pendientes (chip "Pendiente") + rechazados. El marcador en vivo cuenta goles de ambos (incluye pendientes); el oficial lo calcula el SERVIDOR en `finish`.
6. **Finalizar** (solo local): deshabilitado sin red o con cola pendiente; `Alert` de confirmación -> `POST /finish`. **Visitante**: con el partido en PENDING_CONFIRMATION se abre `ResultModal` (al llegar `MATCH_RESULT_PENDING`, que invalida la consulta, o al abrir la sala): Confirmar -> CONFIRMED, Rechazar -> DISPUTED.

## Decisiones
1. **Siempre encolar, incluso con red.** Un único camino y el orden queda garantizado (un evento nuevo nunca adelanta a uno pendiente). Descartado: enviar directo y encolar solo si falla (dos caminos, riesgo de desorden). Coste: el evento aparece unos ms como "Pendiente".
2. **Idempotencia en el servidor, no confiar en "exactamente una vez" del cliente.** El cliente solo garantiza *al menos una vez* (si la app muere tras el envío y antes de borrar, reenvía); `INSERT ... ON CONFLICT (id) DO NOTHING` + mismo id => 200 `alreadyRecorded`, sin duplicar. Descartado: deduplicar en el cliente (no puede saber si el servidor llegó a guardar).
3. **AsyncStorage con un JSON, no SQLite.** La cola son decenas de eventos; menos dependencias. Coste: sin transacciones (lo cubre la idempotencia) y la cola se borra al cerrar sesión (otra cuenta no debe heredarla).

## Preguntas probables
1. *¿Cómo evitas duplicados al reconectar?* UUID del cliente + `ON CONFLICT DO NOTHING`; reenviar devuelve 200 `alreadyRecorded`. Probado con un servidor simulado en `mobile/tests/logic.test.ts` ("crash after the server accepted...") y en el backend (Fase 5).
2. *¿Y si cierro la app con eventos pendientes?* Se guardaron antes de confirmar la UI; al abrir con sesión se cargan y se envían.
3. *¿Por qué no se puede finalizar offline?* El servidor calcula el marcador desde SUS eventos; finalizar con la cola pendiente daría un marcador sin tus goles.
4. *¿Quién impide registrar un gol del rival?* El servidor: compara `participantId` con el del JWT (`NOT_YOUR_TEAM`) y que el jugador sea de tu club; la app solo ofrece tu plantilla.
5. *Difícil: dos goles offline y el admin cierra la fecha antes de reconectar. ¿Qué pasa?* El servidor responde 409 `MATCH_NOT_ACTIVE`; la cola lo marca "Rechazado" con el motivo, sigue con el resto y el jugador lo ve. No hay resolución automática de conflictos: se corrige por disputa/admin. Límite reconocido.

## Errores típicos
- `MATCH_NOT_ACTIVE` / `ROUND_NOT_ACTIVE` (409): evento rechazado en la cola. `INVALID_MINUTE` (422): minuto fuera de 1-120. `MATCH_STATE_CHANGED` (409): alguien cambió el estado; se vuelve a pedir el partido.
- Primer envío tras dormir Render: hasta ~60 s (timeout del cliente); el evento sigue guardado en el teléfono.
- Límite: la cola se borra al cerrar sesión; si el refresh token muere estando offline con eventos, se perderían.
