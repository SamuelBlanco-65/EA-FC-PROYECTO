# Defensa – Fase 5: partidos, eventos y administración

## Qué hace y flujo
**Máquina de estados** (`domain/match_state.py`): una tabla `(estado, acción) -> (estado nuevo, actor)` con 6 transiciones válidas; todo lo demás lanza `InvalidTransition` (24 pares inválidos probados uno a uno en `tests/domain/test_match_state.py`).

**Registrar un evento** (`POST /matches/{id}/events`) -> `api/matches.py` -> `MatchService.record_event`, en este orden: partido existe (404) -> el usuario (del JWT) participa (403) -> juega ese partido (403) -> `participantId` del cuerpo == su participante (403 `NOT_YOUR_TEAM`) -> minuto 1-120 -> **si el `id` ya existe, devuelve el guardado (200)** -> jugador del club propio (422) -> partido `ACTIVE` (409) -> fecha activa (409) -> `INSERT ... ON CONFLICT (id) DO NOTHING` con el JWT del usuario (la política RLS vuelve a comprobarlo).

**Finalizar / confirmar / rechazar / resolver**: el service comprueba el *actor* (local/visitante) antes que el estado, pide la transición al dominio y ejecuta `UPDATE matches ... WHERE id = ? AND status = <el que leí>` con la clave secreta (`match_repository.transition`). 0 filas -> 409 `MATCH_STATE_CHANGED`. El marcador de "finalizar" lo calcula `derive_score` (solo `GOAL`, por equipo); el cuerpo de la petición se ignora.

**Admin**: `POST /admin/tournament/start` baraja los inscritos, llama a `generate_fixtures` y guarda todo con la función SQL `start_tournament` (migración 0010), en una transacción. `POST /admin/rounds/next/activate` exige que la fecha actual esté cerrada (`round_is_closed`) y llama a `activate_round`. Todo `/admin/*` lleva `require_admin` a nivel de router.

## Decisiones
- **Dos candados para lo crítico (service + BD).** El service da el error amable; la RLS de `match_events` y las funciones SQL repiten la regla por si el service tuviera un bug (probado llamando a `activate_round` directo: `ROUND_NOT_CLOSED`). Coste: la regla vive en dos sitios.
- **Funciones SQL solo para lo multi-fila** (iniciar torneo, activar fecha): 30 inserts/updates que deben ser todo o nada. Descartado: bucle en Python (un fallo a medias deja el torneo a medias). Finalizar/confirmar/rechazar siguen en Python con UPDATE condicional: es una sola fila y así la lógica es testeable sin BD.
- **Idempotencia comprobada antes que el estado.** Un reenvío de la cola offline tras finalizar el partido debe responder 200, no 409. Coste: un SELECT extra por evento.

## Preguntas probables
1. *¿Cómo evitas que el visitante registre goles del local?* El `participantId` del cuerpo no se obedece, se compara con el del JWT (`NOT_YOUR_TEAM`); además el jugador debe ser del club propio y la RLS lo repite. Probado con 3 variantes de petición manipulada y contra la BD real (`42501`).
2. *¿Qué pasa si dos peticiones cambian el partido a la vez?* El `UPDATE ... WHERE status = X` solo afecta a una; la otra recibe 409 `MATCH_STATE_CHANGED`.
3. *¿Por qué el marcador no lo manda el cliente?* Se deriva de los eventos GOAL en el servidor; el local no puede inflarlo. Probado con cuerpo `{"homeScore":9}` ignorado.
4. *¿Cómo evitas duplicados al reenviar?* El `id` lo genera el cliente; `ON CONFLICT (id) DO NOTHING` + comprobación previa. Mismo `id` con otros datos -> 409 `EVENT_ID_CONFLICT`.
5. Difícil: *¿Y si llega un gol justo mientras el local pulsa "finalizar"?* Hay una ventana de milisegundos: la RLS valida `ACTIVE` con la foto del inicio de su sentencia, así que el gol podría insertarse tras calcular el marcador. NO resuelto ni probado; consecuencia: el marcador omite ese gol, se ve en la lista de eventos y el visitante puede rechazar -> disputa -> el admin fija el oficial. Cerrarlo exigiría bloquear la fila del partido en el insert.

## Errores típicos
403 `NOT_A_PARTICIPANT` / `NOT_IN_MATCH` / `NOT_YOUR_TEAM` / `NOT_MATCH_HOME` / `NOT_MATCH_AWAY` / `FORBIDDEN`; 409 `MATCH_NOT_ACTIVE`, `ROUND_NOT_ACTIVE`, `INVALID_TRANSITION`, `MATCH_STATE_CHANGED`, `ROUND_NOT_CLOSED`, `NO_MORE_ROUNDS`; 422 `INVALID_MINUTE`, `PLAYER_NOT_IN_CLUB`, `INVALID_LINEUP`. Los eventos del visitante offline que llegan tras finalizar el local se rechazan (`MATCH_NOT_ACTIVE`): es el diseño del enunciado (errores -> disputa).
