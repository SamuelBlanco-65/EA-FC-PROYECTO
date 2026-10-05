# Defensa oral – Índice

Detalle por fase en esta carpeta: `database.md`, `auth.md`, `torneo.md`, `scraper.md`, `match.md`, `realtime.md`, `deploy.md`, `offline.md`, `canvas.md`, `player-card.md`, `app-base.md`, `entorno-y-health.md`. Este archivo es la entrada: arquitectura, un recorrido completo y las preguntas más probables.

## 1. Arquitectura en una página

```
App móvil (Expo, TS) --HTTPS REST + WSS--> Backend propio (FastAPI) --supabase-py / Postgres--> Supabase
                                                  ^                                                 |
                                                  +---- Supabase Realtime (postgres_changes) -------+
```

**Regla del profesor:** el frontend nunca habla con la base de datos. La app solo conoce `EXPO_PUBLIC_API_URL` (`mobile/src/config.ts`); no hay clave de Supabase ni `@supabase/supabase-js` en `mobile/`.

**Capas del backend** (`backend/app/`): `api/` (router HTTP: valida forma, no decide) -> `services/` (reglas de negocio) -> `domain/` (funciones puras: `round_robin.py`, `match_state.py`, `tournament.py`) -> `repositories/` (único lugar que habla con Supabase). Ningún router toca Supabase.

**Seguridad.** El backend valida el JWT en cada request por JWKS (`core/security.py`, solo ES256/RS256) y lee el rol de `profiles`, nunca del cliente (`api/deps.py::get_current_user`, `require_admin`). Dos candados: el service da el error amable y la RLS de Postgres repite la regla (`supabase/migrations/0006_rls.sql`; sin ninguna política para `anon`). Las operaciones de participante usan el JWT del usuario (RLS aplica); admin, seed, asignación de club y listener usan la clave secreta, solo en el backend.

**Base de datos** (`supabase/migrations/0001..0010`): unicidad en la BD (`UNIQUE(tournament_id, club_id)` y `UNIQUE(tournament_id, user_id)`), asignación de club en una función SQL atómica (`assign_random_club`, 0005), iniciar torneo y activar fecha en funciones SQL transaccionales (0010), tabla de posiciones como vista (`standings`, 0004): nunca se guarda ni se desincroniza.

**Estados de partido** (`domain/match_state.py`): `SCHEDULED -> ACTIVE -> PENDING_CONFIRMATION -> CONFIRMED | DISPUTED -> RESOLVED`. Cada transición es `UPDATE ... WHERE id = ? AND status = <esperado>` (`match_repository.transition`); 0 filas = 409. El marcador no lo manda el cliente: el servidor lo deriva de los eventos GOAL al finalizar.

**Tiempo real.** Cambio en BD -> Supabase Realtime -> un único listener del backend (`realtime/listener.py`) -> `dispatcher.py` -> `translator.py` (puro: cambio -> mensaje tipado) -> `audience.py` (quién lo recibe) -> `connection_manager.py` -> WebSocket propio `/ws` (`api/ws.py`) -> la app. El WebSocket solo NOTIFICA; la app invalida su caché y vuelve a pedir el estado por REST (`mobile/src/realtime/invalidation.ts`). Al reconectar se refetchea todo.

**Offline** (`mobile/src/offline/`): lectura desde la caché persistida de TanStack Query; escritura solo de eventos de partido, en cola persistente con UUID del cliente, enviados en orden; el servidor es idempotente (`INSERT ... ON CONFLICT (id) DO NOTHING`). Finalizar, confirmar, rechazar, ruleta, alineación y admin: solo en línea.

**Admin en la app** (`mobile/app/admin/index.tsx`, `mobile/app/admin/matches/[id].tsx`): solo se ofrece con rol admin (`mobile/app/(tabs)/profile.tsx`) y el servidor sigue siendo el que decide (`/admin/*` lleva `require_admin` a nivel de router en `backend/app/api/admin.py`).

**Despliegue:** backend en Render (`render.yaml`, HTTPS/wss), Supabase como BD/Auth/Storage, app en Expo Go (Android). iOS: compatible en código, sin probar.

## 2. Recorrido de un evento (un gol) de punta a punta

Situación: soy el jugador local, el partido está `ACTIVE` y registro un gol.

1. **Pantalla.** `mobile/app/match/[id].tsx` -> `EventModal` -> `submitEvent`: elijo tipo, jugador (de MI plantilla, `GET /me/squad`) y minuto. Genera un UUID con `expo-crypto`.
2. **Cola local.** `submitEvent` llama `eventQueue.enqueue(...)` (`mobile/src/offline/eventQueue.ts::EventQueue.enqueue`): guarda en AsyncStorage ANTES de seguir. Se hace siempre, con y sin red (un solo camino, orden garantizado).
3. **Envío.** `flushQueue()` (`mobile/src/offline/queue.ts`) -> `EventQueue.flush` (FIFO, de uno en uno) -> `api.recordEvent` (`mobile/src/api/endpoints.ts`) -> `apiFetch` (`mobile/src/api/client.ts`, añade el token y refresca una vez ante 401) -> `POST /matches/{id}/events`. Disparadores: red recuperada, `AUTH_OK` del socket, app en primer plano, backoff 2-30 s (`mobile/src/realtime/useAppRuntime.ts`).
4. **Router.** `backend/app/api/matches.py::record_event` (modelo `EventRequest` en `schemas/match.py`; `get_current_user` valida el JWT y trae el rol).
5. **Reglas.** `backend/app/services/match_service.py::MatchService.record_event`, en este orden: partido existe (404) -> juego en él (403) -> `participantId` del cuerpo == mi participante (403 `NOT_YOUR_TEAM`, el cuerpo no se obedece, se compara) -> minuto 1-120 (422) -> si el `id` ya existe devuelve el guardado (200, idempotencia antes que el estado) -> jugador de mi club (422) -> partido `ACTIVE` (409) -> fecha activa (409).
6. **Repositorio.** `backend/app/repositories/match_repository.py::insert_event`: `upsert(..., on_conflict="id", ignore_duplicates=True)` con el JWT del usuario; la política `match_events_insert_own_team` (`0006_rls.sql`) vuelve a comprobar equipo y estado.
7. **Realtime.** La fila nueva dispara `postgres_changes` (tabla publicada en `0007_realtime.sql`). `realtime/listener.py::_handle_payload` crea un `Change` -> `Dispatcher.submit` (cola, no bloquea) -> `dispatch` -> `translator.py::_event_created` produce `MATCH_EVENT_CREATED` para los 2 jugadores del partido (`audience.py::users`) -> `ConnectionManager.send_to_users` -> sockets abiertos (`api/ws.py`).
8. **App.** `mobile/src/realtime/RealtimeService.ts` recibe el mensaje -> `invalidation.ts::invalidateFor` (caso `MATCH_EVENT_CREATED`) invalida `queryKeys.match(id)` -> TanStack Query vuelve a pedir `GET /matches/{id}`; `features/match/derive.ts::mergeEvents` une lo del servidor con lo pendiente y el gol deja de ser "Pendiente".

Si el paso 3 falla por red: el evento sigue en el teléfono; al volver la red se reenvía. Si el servidor ya lo había guardado y la app murió antes de borrarlo de la cola, el reenvío devuelve 200 `alreadyRecorded` y no duplica.

## 3. Las 20 preguntas más probables (respuesta corta)

1. **¿Por qué el frontend no habla con Supabase?** Regla del curso y de seguridad: toda regla vive en el backend, la app no lleva claves. Si se filtra la app, no se filtra la BD.
2. **¿Cómo sabes que un JWT es auténtico?** Firma verificada con la clave pública del JWKS (caché 300 s) más `exp`, `iss`, `aud`; solo ES256/RS256 (evita `alg: none` y confusión HS256). Detalle: `auth.md`.
3. **401 vs 403.** 401: no sé quién eres (sin token o inválido). 403: sé quién eres pero no tienes permiso (participante en `/admin/*`; VERIFICADO: `participant02` recibe 403 `FORBIDDEN`).
4. **¿Quién decide si alguien es admin?** La tabla `profiles`, leída en cada request. El cliente no puede cambiarla: no hay GRANT de UPDATE sobre `role`.
5. **¿Por qué RLS si ya validas en el backend?** Defensa en profundidad: un bug del service o una clave publishable filtrada no abren la BD.
6. **¿Cómo evitas que dos usuarios obtengan el mismo club?** `UNIQUE(tournament_id, club_id)` + función SQL con bloqueo de fila y reintento. Probado: 25 inscripciones simultáneas -> 25 clubes distintos. El servidor elige, la ruleta solo anima.
7. **¿Qué pasa con el participante 26?** La función lanza `TOURNAMENT_FULL`; la API responde 409 y no inserta.
8. **¿Cómo se genera el calendario?** Método del círculo, ida y vuelta (`domain/round_robin.py`), con los inscritos barajados una vez (`AdminService.start_tournament`). N impar: un descanso por ronda, sin fila de partido. Partidos = N·(N−1). Se guarda de golpe con la función SQL `start_tournament`. VERIFICADO con 4 participantes: 12 partidos en 6 fechas.
9. **¿Por qué no se puede activar la fecha siguiente con un partido abierto?** `AdminService.activate_next_round` + `round_is_closed`: todos CONFIRMED o RESOLVED. VERIFICADO: 409 `ROUND_NOT_CLOSED`. La función SQL `activate_round` lo repite.
10. **¿Cómo evitas condiciones de carrera en el estado del partido?** `UPDATE ... WHERE status = <esperado>`; si afecta 0 filas, 409. Dos peticiones simultáneas: una gana. VERIFICADO: resolver dos veces el mismo partido da 409 `INVALID_TRANSITION`.
11. **¿Por qué el marcador no lo manda el cliente?** Se deriva de los eventos GOAL en el servidor al finalizar; el local no puede inflarlo. El cuerpo `{"homeScore":9}` se ignora (probado).
12. **¿Quién impide registrar un gol del rival?** El servidor compara el `participantId` del cuerpo con el del JWT (`NOT_YOUR_TEAM`) y exige que el jugador sea de tu club; la RLS lo repite; la app solo ofrece tu plantilla.
13. **¿Cómo evitas duplicados al reenviar desde la cola offline?** UUID generado por el cliente + `INSERT ... ON CONFLICT (id) DO NOTHING`. Reenviar devuelve 200 `alreadyRecorded`. El cliente solo garantiza "al menos una vez"; la unicidad la da el servidor.
14. **¿Por qué no se puede finalizar sin red o con eventos pendientes?** El servidor calcula el marcador con SUS eventos; finalizar con la cola pendiente daría un marcador sin tus goles. Es una decisión de diseño, el botón se deshabilita.
15. **¿Qué ocurre en una disputa?** El visitante rechaza -> DISPUTED; el admin fija el marcador oficial (y una nota) -> RESOLVED, y entra en la tabla (`POST /admin/matches/{id}/resolve`, pantalla `admin/matches/[id].tsx`). También puede resolver uno PENDING_CONFIRMATION si el visitante no responde. VERIFICADO por API (disputa y pendiente resueltos) y probado por el usuario en el teléfono.
16. **¿Por qué Realtime de Supabase y no emitir tras cada mutación?** Una sola fuente de verdad (cubre también funciones SQL y arreglos manuales), avisa tras el commit y escala a varias instancias. Coste: un salto más (27–330 ms medidos) y depender de Realtime. Detalle: `realtime.md`, `docs/architecture/realtime.md`.
17. **¿Qué pasa si el WebSocket se cae?** La BD es la verdad y el socket solo notifica: al reconectar, la app invalida todo y vuelve a pedir el estado por REST (backoff exponencial con tope). El listener del backend tiene supervisor propio.
18. **¿Cómo se calcula la tabla?** Vista SQL `standings` sobre partidos CONFIRMED/RESOLVED: 3/1/0, orden PTS, DG, GF, nombre. No se guarda. VERIFICADO a mano tras el flujo admin (4 clubes, 3 partidos cada uno: PTS 6/5/4/1, DG +2/+3/−1/−4).
19. **¿Por qué no scrapeaste SoFIFA automáticamente?** Cloudflare, `robots.txt` con 403 y términos poco claros: automatizarlo implicaba sortear una protección. Se guardan las páginas a mano y se parsean localmente (`scraper.md`). Uso académico, no comercial.
20. **¿Qué no funciona o no está probado?** (Responder con honestidad.) Hay una ventana de milisegundos entre un gol y "finalizar" (consecuencia: disputa; `match.md`). Con eventos offline y fecha cerrada antes de reconectar, el evento se rechaza y queda visible. Render gratuito se duerme (~24 s la primera petición). El admin no recibe por WebSocket los rechazos del visitante (esos mensajes van a los dos jugadores): su cola de pendientes se actualiza con un sondeo de 10 s. iOS sin probar. Las pantallas de administración se probaron en el teléfono sin un diseño de referencia (no existían las capturas 13 y 14): siguen `docs/design/design-system.md`.

## 4. Demostración sugerida (5 minutos)

1. `setup_demo.py 4 --yes --start --play-rounds 2 --dispute` (ver README): torneo con 4 bots, 2 fechas jugadas, una disputa y un resultado sin responder.
2. Teléfono con `admin@example.com`: Perfil -> Administración -> abrir la disputa -> fijar marcador -> Resolver.
3. Activar la siguiente fecha; mostrar la tabla y el calendario actualizados en otro dispositivo (tiempo real).
4. Cerrar con `setup_demo.py --teardown --yes` si hay que devolver el torneo anterior.
