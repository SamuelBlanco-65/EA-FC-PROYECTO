# Defensa: administración en la app y torneo de demo (Fase 11)

## Qué hace y flujo
1. **Entrada.** `mobile/app/(tabs)/profile.tsx` muestra "Administración" solo si `user.role === 'admin'`. Es cosmético: las pantallas redirigen a `/home` si no eres admin y, sobre todo, todo `/admin/*` exige `require_admin` a nivel de router (`backend/app/api/admin.py`).
2. **Panel** (`mobile/app/admin/index.tsx`): tres consultas (`GET /tournament`, `GET /admin/matches`, `GET /admin/participants`, hooks en `features/admin/hooks.ts`). Tarjeta de estado (inscritos, fecha activa, partidos cerrados de la fecha), botón **Iniciar torneo** (`POST /admin/tournament/start`) o **Activar siguiente fecha** (`POST /admin/rounds/next/activate`) con `Alert` de confirmación, cola de **pendientes y disputas** (`features/admin/derive.ts::needsAction`) y lista de participantes.
3. **Resolver** (`mobile/app/admin/matches/[id].tsx`): `GET /matches/{id}`, marcador calculado con los goles (`recordedGoals`), lo que dijo el local, el estado del visitante, marcador oficial (`parseScore`, entero 0-99) y nota. `POST /admin/matches/{id}/resolve` -> `MatchService.resolve` -> `transition` condicional -> RESOLVED -> la vista `standings` ya lo cuenta.
4. **Refresco.** Tras cada acción se invalidan torneo, calendario, tabla y listas admin. El admin recibe por WebSocket `ROUND_ACTIVATED`/`STANDINGS_UPDATED` (a todos), pero NO el rechazo del visitante (va a los 2 jugadores): por eso `useAdminMatches` sondea cada 10 s.
5. **Demo** (`scripts/demo/setup_demo.py`): sin `--yes` solo imprime el plan. Con `--yes` borra los torneos llamados exactamente `Torneo de demo` (primero `match_events`, que no tiene `ON DELETE CASCADE`), crea uno DRAFT, inscribe N bots por la API (el servidor sortea los clubes) y opcionalmente inicia, juega fechas y deja una disputa. `--teardown` lo borra.

## Decisiones
- **La app solo refleja; el servidor decide.** Los botones se deshabilitan como pista (fecha abierta, sin red) pero no se duplica la regla: si el servidor dice 409 (`ROUND_NOT_CLOSED`, `INVALID_TRANSITION`) se muestra su mensaje. Descartado: calcular en el cliente si "se puede" (dos sitios que divergen). Coste: un viaje de red para ver el error exacto.
- **Un torneo de demo nuevo, no reiniciar el existente.** No hay endpoint de reinicio y el torneo de prueba pertenece al usuario; el de demo se crea aparte y se borra con `--teardown`. Coste: mientras exista, es el "torneo actual" y oculta al anterior.
- **Sondeo de 10 s para la cola del admin** en vez de cambiar el backend para avisar al admin. Coste: hasta 10 s de retraso; ventaja: Fase 11 no toca el contrato de WebSocket.

## Preguntas probables
1. *¿Un participante puede llamar a las rutas admin?* No: 403 `FORBIDDEN` (VERIFICADO con `participant02`). Ocultar el botón no es seguridad; la seguridad es `require_admin`.
2. *¿Qué pasa si activas la fecha con un partido abierto?* 409 `ROUND_NOT_CLOSED` del service y de la función SQL `activate_round`.
3. *¿Y si resuelves dos veces?* El `UPDATE ... WHERE status = <esperado>` no encuentra fila: 409 `INVALID_TRANSITION` (VERIFICADO).
4. *¿Qué marcador entra en la tabla de una disputa?* El oficial que fija el admin (`resolve`), no el del local.
5. Difícil: *Si el admin resuelve justo cuando el visitante confirma, ¿quién gana?* Quien haga primero su `UPDATE` condicional; el otro recibe 409 y la app vuelve a pedir el estado. No hay prueba automática de esa carrera concreta.

## Errores típicos
- `setup_demo.py` falla al iniciar sesión: faltan cuentas (`create_users.py N+1`) o contraseñas (`demo.env`); falla ANTES de borrar nada.
- Tras `setup_demo.py --yes` la app del teléfono muestra el torneo nuevo; `--teardown --yes` devuelve el anterior.
- Un admin que no juega no debe pasar por la ruleta: `app/index.tsx` lo manda a Perfil (la prueba en el teléfono lo destapó: con el torneo iniciado la ruleta daba "inscripción cerrada").
