# Archivo de progreso (fases antiguas)

Fases ya cerradas, movidas desde `docs/PROGRESS.md` para que cada sesión lea menos. Solo consúltalo si necesitas el detalle de una fase vieja.

## Fase 4 – Inscripción, calendario y tabla – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- `POST /participants/me/assign-club` (clave secreta + RPC `assign_random_club`), idempotente; `GET /tournament`, `/tournament/standings`, `/tournament/fixtures` (JWT del usuario, RLS). Las 5 rutas nuevas aparecen en el OpenAPI.
- `domain/round_robin.py`: 48 tests (N=2,3,4,5,6,25 + ejemplo exacto de 4 equipos). Tabla: vista SQL existente + 16 tests nuevos contra BD real (V/E/D, DG, GF, nombre, estados que no cuentan, sin partidos, torneos separados), con rollback.
- Concurrencia por HTTP real: 10 usuarios simultáneos -> 10 clubes distintos; luego 15 más -> 25 distintos; el 26º -> 409 `TOURNAMENT_FULL` sin insertar. 5 de 5 ejecuciones OK con HTTP/1.1. La BD quedó limpia (0 torneos/usuarios de prueba; 25 clubes, 677 jugadores).
- `python -m pytest` (backend): 137 passed (con integración). Docs: `docs/domain/calendar.md`, `docs/defense/torneo.md`.
No probado / pendiente:
- Nada llama aún a `generate_fixtures` ni crea torneos: iniciar torneo y guardar partidos es la fase admin, así `/tournament/fixtures` solo se probó vacío o con repositorio simulado.
- `crestUrl` apunta a `/media/crests/{id}`: ruta NO implementada. Los endpoints se probaron con el TestClient de FastAPI (pila ASGI completa y BD real), no arrancando uvicorn.
- Bug de infraestructura: con HTTP/2 el servidor cortaba la conexión compartida (`Server disconnected`, 9 de 15 peticiones fallaron, 2 de 3 ejecuciones). Cambiado a HTTP/1.1 (0 fallos en 5). Causa raíz del corte NO DETERMINADA.
- `backend/.env` ahora exige `SUPABASE_SECRET_KEY` (ya estaba para el scraper). `backend/.env.example` borrado a propósito por el usuario (ver Fase 5).
Decisiones clave: tabla = vista SQL (sin duplicar en Python); concurrencia resuelta en la BD; torneo "actual" = el más reciente; respuesta de la ruleta = los 25 clubes; `alreadyAssigned` calculado con una lectura previa (carrera benigna documentada).
Archivos principales: `backend/app/domain/{round_robin,tournament}.py`, `backend/app/services/tournament_service.py`, `backend/app/repositories/{tournament,participant,club}_repository.py`, `backend/app/api/{participants,tournament}.py`, `backend/app/schemas/tournament.py`, `backend/tests/{domain,api,integration}/`.
Cómo probarlo (PowerShell):
- `cd backend; .\venv\Scripts\python.exe -m pytest tests\domain tests\api` (sin red)
- `.\venv\Scripts\python.exe -m pytest tests\integration\test_standings_view.py tests\integration\test_assign_club_concurrency.py` (Supabase real, ~1 min)
Siguiente paso: Fase 5 (la define el usuario).

## Fase 3 – Scraper y seed – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- Fuente: páginas SoFIFA (FC27) guardadas a mano y parseadas sin red (`ScrapingSource` + parser puro). 25 clubes, 863 jugadores encontrados, 677 válidos, 186 rechazados (todos cedidos), 25 escudos, 663 fotos, 14 fotos faltantes = NULL. `overall_rating` viene de la fuente (0 NULL).
- `seed.py` ejecutado dos veces: 25 clubes / 677 jugadores / 688 objetos en el bucket `media` y mismo hash de UUID antes y después.
- Migraciones 0008 (bucket privado `media`) y 0009 (6 estadísticas de carta). Tests: `pytest` 55 passed (6 del scraper); `test_schema` 26/26 (1 caso se salta con clubes reales), `test_assign_club` 3/3, `test_rls` 48/48.
- Bug real corregido: overall NULL cuando la celda traía `+1` (23 jugadores); ahora con test.
No probado / pendiente:
- Servir las imágenes por `/media` (fase del backend de media). Ningún acceso HTTP a SoFIFA (robots ilegible por Cloudflare, términos no concluyentes): no se automatiza.
- Bundesliga y Ligue 1: top 5 verificado solo con Wikipedia (campeones con otras fuentes). Jugadores que desaparecen de la fuente no se borran. Fotos de 60x60 px.
Decisiones clave: guardado manual vs scraping automático; 13 campos (7 del proyecto + 6 de carta, a petición del usuario); stats de portero con otro significado (se etiquetan por `position`); parser por `data-col`.
Archivos principales: `scraper/{settings,normalize,validate,media,pipeline,seed}.py`, `scraper/{sources,parsers}/`, `config/tournament-clubs.json`, `supabase/migrations/{0008,0009}_*.sql`, `docs/scraping/scraping.md`, `docs/defense/scraper.md`, `README.md`.
Cómo probarlo (PowerShell, desde la raíz):
- `.\backend\venv\Scripts\python.exe -m pytest scraper\tests`
- `.\backend\venv\Scripts\python.exe -m scraper.pipeline` y luego `-m scraper.seed` (dos veces: los totales no cambian)
Siguiente paso: Fase 4 (la define el usuario).


## Fase 2 – Autenticación – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- Config, errores `{"error":{code,message,details}}`, logging con redacción de tokens/claves, CORS y capas (`core`, `domain`, `schemas`, `repositories`, `services`, `api`).
- `POST /auth/login`, `/auth/refresh`, `GET /me` contra el Supabase real y con uvicorn real; `/docs` lista las 5 rutas. Login de `participant01` y `admin` correcto; contraseña mala -> 401; el log no contiene ningún token.
- `get_current_user` (JWKS ES256) y `require_admin` (rol desde `profiles`): 401 sin token, 401 token inválido, 403 participante, 200 admin; también expirado, firma ajena, iss/aud erróneos, HS256 y `alg=none`.
- `/auth/register` real (201 con sesión, rol participant aunque se envíe `role`, duplicado 409) tras desactivar "Confirm email" en Supabase. `python -m pytest`: 49 passed, 0 skipped. Cuentas demo: admin + participant01..05.
No probado / pendiente:
- Requisito de configuración: "Confirm email" OFF y proveedor Email ON en Supabase (Authentication > Sign In / Providers). Con confirmación ON el registro da 429 por el límite de correos y EMAIL_CONFIRMATION_REQUIRED solo está probado con repositorio simulado. Con el proveedor Email OFF todo el login falla (`AUTH_PROVIDER_DISABLED`, 503). Cualquiera puede registrarse con un correo ajeno (aceptado: torneo cerrado, el admin controla el torneo).
- Sin límite de intentos de login propio (solo el de Supabase). Una consulta extra a `profiles` por request autenticado (sin caché).
Decisiones clave: validación local por JWKS (sin llamar a Auth por request); rol desde `profiles` y no del token; cliente Auth nuevo por operación; el rol nunca se acepta en el registro.
Archivos principales: `backend/app/core/{config,errors,logging,security,supabase_clients}.py`, `backend/app/api/{deps,auth,me}.py`, `backend/app/services/auth_service.py`, `backend/app/repositories/{auth,profile}_repository.py`, `scripts/demo/create_users.py`, `docs/defense/auth.md`.
Cómo probarlo (PowerShell, desde la raíz del repo):
- `cd backend; .\venv\Scripts\python.exe -m pytest` (añade `-m "not integration"` para saltar Supabase real)
- `.\backend\venv\Scripts\python.exe scripts\demo\create_users.py 5` (contraseñas en `scripts\demo\demo.env`, ignorado por git)
- `cd backend; .\venv\Scripts\python.exe -m uvicorn app.main:app --port 8000` y abrir http://localhost:8000/docs -> `/auth/login` con `participant01@example.com`
Siguiente paso: Fase 3 (la define el usuario).


## Fase 1 – Base de datos – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO, ejecutado contra el Supabase real):
- 7 migraciones aplicadas con `scripts/db/apply_migrations.py` (enums, tablas, restricciones, índices, trigger de profiles, vista `standings`, `assign_random_club`, RLS en las 8 tablas + `schema_migrations`, Realtime). Segunda ejecución: "Nothing to apply".
- `test_schema.py` 27/27 (restricciones, trigger, vista, función; sin dejar datos). `test_assign_club.py` 3/3 (6 usuarios simultáneos, 10 rondas). `test_rls.py` 48/48 con JWT reales; `pytest` del backend 1 passed.
- Publicación `supabase_realtime` contiene `matches` y `match_events` (consultado en `pg_publication_tables`).
- Docs: `docs/database/schema.md`, `docs/database/security.md`, `docs/defense/database.md`.
No probado / pendiente:
- ENTREGA de eventos Realtime al listener (fase de realtime). Procedimiento de publicación no contrastado con la doc de Supabase (SQL estándar, verificado por consulta).
- Bucket `media` de Storage (fase del scraper). `clubs` y `players` vacías hasta el seed.
- Validación del JWT en el backend y reenvío de un evento con el partido ya no ACTIVE (RLS probablemente lo rechaza).
Decisiones clave: unicidad y reglas en la BD además del backend; `assign_random_club` con bloqueo de la fila del torneo + reintento; permisos por columna para que `role` sea inmutable; `standings` con `security_invoker`; psycopg 3 como driver; `DATABASE_URL` por Session pooler (la directa es solo IPv6).
Archivos principales: `supabase/migrations/0001..0007_*.sql`, `scripts/db/{apply_migrations,common,test_schema,test_assign_club,test_rls}.py`, `docs/database/*`.
Cómo probarlo (PowerShell, desde la raíz del repo):
- `.\backend\venv\Scripts\python.exe scripts\db\apply_migrations.py --status`
- `.\backend\venv\Scripts\python.exe scripts\db\test_schema.py`
- `.\backend\venv\Scripts\python.exe scripts\db\test_assign_club.py`
- `.\backend\venv\Scripts\python.exe scripts\db\test_rls.py`
Siguiente paso: Fase 2 (la define el usuario).

## Fase 0 – Entorno y diseño – 2026-10-02
Estado: PARCIAL (código y docs listos; falta que el usuario vea el QR y abra la app en Expo Go)
Hecho (VERIFICADO):
- Estructura de carpetas de CLAUDE.md, `.gitignore`, `backend/.env.example`, `mobile/.env.example`.
- Backend: venv Python 3.12.0, FastAPI mínimo; `GET /health` → 200 `{"status":"ok"}` con uvicorn real; `python -m pytest` → 1 passed.
- Mobile: Expo SDK 57 + TypeScript + Expo Router; `tsc --noEmit` OK, `expo-doctor` 21/21, bundle Android servido por HTTP 200 (1401 módulos).
- Docs: `docs/VERSIONES.md` (versiones + fuentes), `docs/design/design-system.md`, `docs/design/screens.md` (19 imágenes leídas una sola vez).
No probado / pendiente:
- QR de `npx expo start` y arranque en Expo Go (Android 14): NO PROBADO (terminal sin TTY).
- Que Skia, Reanimated, Gesture Handler, screen-orientation y secure-store corran en el teléfono: NO PROBADO (la doc de Expo los lista como incluidos en Expo Go).
- Riesgo: SDK 58 estable saldrá pronto y Expo Go de la tienda dejará de soportar SDK 57 (ver VERSIONES.md).
- Hex y tamaños del diseño son estimados desde las capturas; endpoints y eventos WS de `screens.md` son una PROPUESTA.
- Confirmar con el usuario: almacenamiento offline (expo-sqlite propuesto) y venv en Python 3.12 en vez de 3.14.
Decisiones clave: SDK 57 (el estable actual); `react-dom` instalado por exigencia de expo-router; sin `expo-font` ni iconos aún; mobile sin ninguna clave de Supabase.
Archivos principales: `backend/app/main.py`, `backend/app/api/health.py`, `backend/tests/test_health.py`, `mobile/app/_layout.tsx`, `mobile/app.json`, `docs/VERSIONES.md`, `docs/design/*`.
Cómo probarlo (PowerShell):
- `cd backend; .\venv\Scripts\Activate.ps1; python -m pytest; uvicorn app.main:app --reload` y abrir http://localhost:8000/health
- `cd mobile; npx expo start` y escanear el QR con Expo Go
Siguiente paso: Fase 1 (la define el usuario); antes, confirmar las tres decisiones pendientes.

## Fase 5 – Partidos, eventos y administración – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- `domain/match_state.py`: tabla de 6 transiciones + actor; 24 pares inválidos y 6 válidos probados uno a uno. `derive_score` y `round_is_closed` puros.
- 13 endpoints nuevos (en el OpenAPI de uvicorn real): `/admin/{tournament/start, rounds/next/activate, matches, matches/{id}/resolve, participants}`, `/matches/{id}[/events|/finish|/confirm|/reject]`, `/me/squad`, `/lineups/me` (GET/PUT). Migración 0010 aplicada (`start_tournament`, `activate_round`, solo `service_role`).
- Tests exigidos, con mutación (quitar la validación hace fallar el test): visitante con petición manipulada (3 variantes), visitante no finaliza, local no confirma/rechaza, fecha 2 bloqueada con la 1 abierta (ACTIVE/PENDING/DISPUTED), reenvío no duplica.
- Flujo completo contra Supabase real (`test_match_flow_real.py`): RLS con `ON CONFLICT`, insert directo ajeno -> `42501`, funciones SQL llamadas sin el service (`ROUND_NOT_CLOSED`, `ROUND_CHANGED`, `TOURNAMENT_NOT_DRAFT`), marcador 3-2 derivado, tabla actualizada, disputa y resolución.
- `python -m pytest` (backend): 308 passed (con integración, ~2,5 min). BD limpia al terminar (0 torneos, 0 usuarios de prueba; 25 clubes, 677 jugadores).
No probado / pendiente:
- Carrera "gol que llega mientras el local finaliza": ventana de ms, sin test ni solución (ver `docs/defense/match.md`). Dos admins activando a la vez: solo la guarda SQL `ROUND_CHANGED` probada, no la concurrencia real.
- Sigue sin existir endpoint para CREAR el torneo (DRAFT); hoy se inserta por SQL. El torneo nunca pasa a `FINISHED` al cerrar la última fecha. Rutas `/media/...` y WebSocket/Realtime: siguen sin implementar.
- Con uvicorn real solo se probó sin token; los flujos autenticados se probaron con el TestClient de FastAPI (pila ASGI completa y BD real).
- Bug de infraestructura encontrado: borrar un torneo con eventos falla (`match_events.participant_id` sin CASCADE); el test borra los eventos antes. `backend/.env.example` fue borrado a propósito por el usuario: en `backend/` solo existe `.env` (decisión confirmada el 2026-10-03).
Decisiones clave: dos candados (service + BD); SQL solo para lo multi-fila; reenvío idempotente comprobado antes que el estado; `participantId` del cuerpo se compara, no se obedece.
Archivos principales: `backend/app/domain/{match_state,match}.py`, `backend/app/services/{match,admin,squad,common}_service.py`, `backend/app/repositories/{match,player,lineup}_repository.py`, `backend/app/api/{matches,admin,squad}.py`, `supabase/migrations/0010_*.sql`, `backend/tests/{domain,api,integration}/`.
Cómo probarlo (PowerShell): `cd backend; .\venv\Scripts\python.exe -m pytest tests\domain tests\api` (sin red) y `.\venv\Scripts\python.exe -m pytest tests\integration\test_match_flow_real.py` (Supabase real, ~1 min).
Siguiente paso: Fase 6 (la define el usuario).

## Fase 6 – Realtime, WebSocket y bot visitante – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- Listener de Supabase Realtime (`realtime/listener.py`, `postgres_changes` de `matches` y `match_events`, clave secreta) arrancado en el lifespan, con supervisor propio: vigila cada 5 s, reconstruye con backoff 1-30 s y tras cada recuperación envía `RESYNC_REQUIRED`. API de `realtime` 2.32.0 comprobada leyendo el código y ejecutando (ver `docs/VERSIONES.md`).
- `/ws`: AUTH por primer mensaje (5 s), cierres 4401 con razón estable, PING/PONG, cierre al expirar el token. `ConnectionManager` (varios sockets por usuario, timeout 5 s por socket). Traductor puro, 8 eventos pedidos, avisos de partido solo a los 2 jugadores, globales a todos; ráfagas (600 inserts, fecha entera) = 1 evento.
- Cadena completa contra Supabase real con uvicorn real y clientes `websockets` (`test_realtime_real.py`): torneo, fecha, gol, finalizar, rechazar, resolver, confirmar. Latencia desde que vuelve la respuesta HTTP: 27-330 ms. El tercer jugador y (en gol) el admin no reciben avisos del partido ajeno.
- `visitor_bot.py` y `simulate_match.py` probados contra uvicorn real (puerto 8001): caso aprobado (CONFIRMED 2-1), disputa + resolución admin (RESOLVED 1-1), `--scenario both` con visitante simulado, reconexión del bot tras parar y reiniciar el servidor.
- `python -m pytest` (backend): 371 passed (333 sin integración). Mutaciones: público de los avisos y deduplicación hacen fallar tests; la de autenticación se detecta por bloqueo. BD limpia al terminar (0 torneos; usuarios solo admin + participant01..05).
No probado / pendiente:
- Recuperación del listener ante una caída REAL de Supabase Realtime: solo con cliente simulado. `RESYNC_REQUIRED` no es de los 8 pedidos: lo añadí yo (sin él un cliente conectado se queda con datos viejos).
- Los admin no reciben `MATCH_DISPUTED`/eventos de partido (decisión para la fase de admin). Espejo `mobile/src/realtime/events.ts`: pendiente (Fase 8). wss/HTTPS: Fase 7.
- Seguía sin existir endpoint para CREAR el torneo (hoy SQL), `FINISHED` nunca se alcanza, y `/media/...` sin implementar. Un uvicorn `--reload` tuyo seguía en el puerto 8000 (no lo toqué; mis pruebas usaron el 8001).
Decisiones clave: Realtime en vez de emitir tras mutar; audiencia aprendida de las filas (la consulta REST por aviso costaba ~1,4 s); el WebSocket solo notifica.
Archivos principales: `backend/app/realtime/{events,translator,dispatcher,audience,connection_manager,listener,hub}.py`, `backend/app/api/ws.py`, `backend/app/repositories/audience_repository.py`, `scripts/demo/{visitor_bot,simulate_match,_common}.py`, `backend/tests/{realtime,api/test_ws.py,integration/test_realtime_real.py}`, `docs/architecture/realtime.md`, `docs/defense/realtime.md`.
Cómo probarlo (PowerShell): `cd backend; .\venv\Scripts\python.exe -m pytest tests\realtime tests\api\test_ws.py` (sin red) y `.\venv\Scripts\python.exe -m pytest tests\integration\test_realtime_real.py -s` (Supabase real, ~40 s). Dos terminales: ver `docs/architecture/realtime.md` (final).
Siguiente paso: Fase 7 (la define el usuario).

## Fase 7 – Despliegue del backend (Render) – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- Comparativa Render / Cloud Run / Koyeb con fuentes oficiales (`docs/architecture/deploy.md`); Fly.io descartado (sin plan gratuito para cuentas nuevas, solo fuentes de terceros). Elegido Render free.
- Desplegado en `https://ea-fc-api.onrender.com` desde `render.yaml` (Blueprint; Python 3.12.0 aceptado; 3 claves de Supabase con `sync: false`, fuera del repo). Listener de Supabase suscrito en Render. Antes, build desde cero en local (venv limpio, sin `.env`).
- `scripts/deploy/check_deploy.py` contra la URL pública: `/health` 200 por HTTPS (~0,8 s), upgrade wss, anónimo recibe `AUTH_ERROR AUTH_REQUIRED`, login + `AUTH_OK` + `PING->PONG` (252 ms): ALL CHECKS PASSED.
- Hallazgo: la trama de cierre 4401 no llega al cliente a través de Render (cierre anormal a los ~21 s; en local llega al instante). Arreglo aprobado por el usuario: `AUTH_ERROR {code}` como trama de datos antes de cerrar (`ws.py::_close`); 16 tests fallan sin él (mutación). Reverificado en producción: `INVALID_TOKEN` a +1,2 s.
- Se duerme: tras ~23,5 min sin tráfico el primer `/health` tardó 24,2 s (una muestra; la doc dice ~1 min). Los health checks internos de Render (cada ~5 s) no cuentan como tráfico.
- Pruebas: 333 passed sin integración; `test_realtime_real.py` 1 passed (Supabase real). BD limpia: 0 torneos, usuarios solo admin + participant01..05.
No probado / pendiente:
- Causa exacta de la pérdida de la trama de cierre (Cloudflare o balanceador de Render): NO DETERMINADA.
- NO PROBADO: que un PING de aplicación mantenga despierto el servicio con el WS abierto; qué ve un WS abierto cuando el servicio se duerme; más muestras del arranque en frío.
- Espejo `mobile/src/realtime/events.ts` debe incluir `AUTH_ERROR` (Fase 8). Siguen sin existir `/media/...` ni el endpoint para crear el torneo. La clave secreta de Supabase quedó visible en esta sesión (selección del IDE): rotarla es decisión del usuario.
Decisiones clave: Render (proceso persistente para el listener; Cloud Run por petición lo dejaría sin CPU); `AUTH_ERROR` como mensaje de datos porque es lo que sí atraviesa el proxy.
Archivos principales: `render.yaml`, `scripts/deploy/check_deploy.py`, `backend/app/api/ws.py`, `backend/app/realtime/events.py`, `docs/architecture/deploy.md`, `docs/defense/deploy.md`.
Cómo probarlo (PowerShell): `cd backend; .\venv\Scripts\python.exe -m pytest tests\api\test_ws.py` (sin red) y, desde la raíz, `backend\venv\Scripts\python.exe scripts\deploy\check_deploy.py https://ea-fc-api.onrender.com` (si estaba dormido tarda ~25-60 s).
Siguiente paso: Fase 8 (la define el usuario). La URL pública será `EXPO_PUBLIC_API_URL`.

## Fase 8 – App: base, auth, ruleta, home, tabla, calendario – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- Backend: `GET /participants/me` (solo lectura, no inscribe) y `GET /media/crests/{id}` + `/media/players/{id}` (JWT, PNG del bucket privado, ETag/304, `Cache-Control: private`). 348 passed sin integración; `tests/integration/test_app_flow_real.py` 6 passed contra Supabase real. Desplegado en Render y comprobado en la URL pública: login, `/participants/me` 403, `/tournament`, escudo 200 + 304 + anónimo 401, refresh, wss `AUTH_OK` (1,3 s).
- App: `npx tsc --noEmit` limpio; `npx expo export --platform android` empaqueta (Hermes); lógica pura (`derive.ts`, `validation.ts`, `events.ts`) ejecutada con aserciones. Paquetes con `expo install` (ver `docs/VERSIONES.md`).
- Hecho: tema desde `design-system.md`, cliente API con refresh en 401, sesión en SecureStore, caché persistida (AsyncStorage), Zustand (sesión/conexión), Login, Registro, Ruleta (Skia+Reanimated, el servidor elige), Home, Tabla, Calendario, Perfil mínimo (solo cerrar sesión), `RealtimeService` + banner, `ClubCrest`/`PlayerAvatar` (expo-image, caché en disco, iniciales).
- BD: creé a propósito 1 torneo `Torneo de prueba` (era DRAFT; desde la Fase 9 está ACTIVE, ver `CLAUDE.md`); 0 usuarios `it-*` huérfanos.
- VERIFICADO por el usuario en Expo Go (Android): registro -> ruleta -> club asignado -> vistas; escudos reales en Inicio, Tabla y Perfil; modo avión: tabla y calendario desde caché tras cerrar y reabrir; banner "Sin conexión" y chip "En línea" al volver la red.
- Corregido tras la prueba: aviso de Skia (`SkPath.moveTo` obsoleto -> `Skia.PathBuilder`) y escudos invisibles (el contenedor con `overflow: hidden` + borde discontinuo recortaba la imagen en Android; ahora el placeholder es un hermano y no hay recortes). Perfil: añadida tarjeta "Mi club" con escudo.
No probado / pendiente:
- NO PROBADO: Calendario con partidos (eres el único inscrito, no hay fixtures), WebSocket recibiendo avisos reales en la app, arranque en frío de Render (el cliente espera hasta 60 s). Quedan logs `[media]` solo en desarrollo (`__DEV__`) en `ClubCrest.tsx`; quitarlos cuando no hagan falta.
- Hex y fuentes del diseño siguen siendo estimaciones (no muestreados). Sin: pestaña Plantilla, botón "Entrar a la sala" (Fase 9), "¿Olvidaste tu contraseña?" (no hay endpoint), confeti. Aún no hay endpoint para crear torneos (el `Torneo de prueba` DRAFT lo creé por SQL y sigue en la BD); la clave secreta de Supabase sigue pendiente de rotar (decisión tuya).
Decisiones clave: caché de TanStack Query persistida (no copiar datos a Zustand); `/participants/me` aparte de `assign-club`; `/media` con JWT y caché por URL sin token; Home compuesto en cliente con funciones puras (sin `/home`).
Archivos principales: `mobile/app/**`, `mobile/src/{api,stores,realtime,theme,components,features}`, `backend/app/{api/media.py,services/media_service.py,repositories/media_repository.py}`, `docs/defense/app-base.md`.
Cómo probarlo (PowerShell): `cd mobile; npx expo start --clear` y abrir con Expo Go (la URL está en `mobile/.env`: `EXPO_PUBLIC_API_URL=https://ea-fc-api.onrender.com`). Tests: `cd backend; .\venv\Scripts\python.exe -m pytest -m "not integration"`; `cd mobile; npx tsc --noEmit`.
Siguiente paso: Fase 9 (la define el usuario).

## Fase 9 – Sala de partido horizontal + cola offline – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO por el usuario en Expo Go, Android): giro a horizontal, registrar goles/tarjetas, caso aprobado, caso rechazado, modal del visitante y prueba en modo avión con los 2 goles; "todo funciona". Corregido tras la prueba: en partidos de visitante el gol subía la casilla de la derecha del marcador (orden local:visitante) y parecía del rival; ahora el marcador de arriba muestra MI número a la izquierda, con el club bajo cada casilla (NO PROBADO visualmente tras el cambio; solo `tsc`).
Hecho (VERIFICADO por mí):
- `npx tsc --noEmit` limpio; `npx expo export --platform android` empaqueta; `npm run test:logic` 14 passed (cola: persistencia y recuperación, orden, fallo transitorio, rechazo definitivo sin bloquear, ráfagas concurrentes, caída entre "servidor aceptó" y "cola olvidó" sin duplicar contra un servidor simulado idempotente; derivaciones de la sala). Backend intacto: 348 passed sin integración. BD sin tocar (0 tests de integración ejecutados; sigue el `Torneo de prueba` DRAFT con 1 participante).
- Hecho: `app/match/[id].tsx` (marcador, eventos en vivo, TU EQUIPO / OPONENTE, Gol/Amarilla/Roja con jugador + minuto, Finalizar del local con confirmación, `ResultModal` Confirmar/Rechazar del visitante, barra "Sin conexión – N eventos pendientes"), `offline/eventQueue.ts` + `queue.ts` (cola en AsyncStorage, envío en orden, backoff), disparadores en `useAppRuntime.ts` (red, WebSocket, primer plano), botón "Entrar a la sala" en Inicio y Calendario, `scripts/demo/room_helper.py` para la prueba guiada (solo `status` ejecutado, lectura).
No probado / pendiente:
- El usuario no reportó fallos de orientación, modales ni escudos; no detalló el teclado del minuto. No guardé la salida de `room_helper.py events` (conteo de ids en el servidor): el "llegan 1 vez" es lo que el usuario vio.
- Diferencia con el diseño: el chip "Ahora" del minuto se llama "Último" (no hay reloj de partido; vale el último minuto registrado). Sin pestaña Plantilla. Un envío tras dormir Render puede tardar hasta 60 s. La cola se borra al cerrar sesión.
Decisiones clave: siempre encolar (con y sin red) para un único camino y orden garantizado; idempotencia por UUID del cliente en el servidor; AsyncStorage en vez de SQLite; 4xx definitivo = "rechazado" visible, no bloquea la cola.
Archivos principales: `mobile/app/match/[id].tsx`, `mobile/src/features/match/*`, `mobile/src/offline/*`, `mobile/tests/logic.test.ts`, `scripts/demo/room_helper.py`, `docs/defense/offline.md`.
Cómo probarlo (PowerShell, raíz del repo; guion completo en el último mensaje de la sesión):
`$env:API_URL="https://ea-fc-api.onrender.com"; backend\venv\Scripts\python.exe scripts\demo\room_helper.py setup` (inscribe participant02/03, inicia el torneo, activa la fecha 1), luego `status`, `advance`, `play-home`, `resolve`, `events`; bot: `backend\venv\Scripts\python.exe scripts\demo\visitor_bot.py --email participant02@example.com --approve`. Tests: `cd mobile; npm run test:logic; npx tsc --noEmit`.
Siguiente paso: Fase 10 (la define el usuario). Los partidos de la prueba quedan en el `Torneo de prueba` (ahora ACTIVE, con bots participant02/03 inscritos).

## Fase 10 – Pizarra táctica – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO por mí): `npx tsc --noEmit` limpio; `npm run test:logic` 48 passed (34 nuevos en `tests/tactics.test.ts`: conversión px<->normalizado, clamp con radio y hueco de nombre, arrastre, las 4 formaciones, reparto de 11 jugadores, firma de cambios, estadística de fotogramas); `npx expo export --platform android` empaqueta (Hermes). Backend intacto: 348 passed sin integración; `/lineups/me` ya estaba cubierto en `test_squad_endpoints.py` y no se tocó. BD sin tocar.
- Hecho: `app/tactics.tsx` (4 formaciones, campo Skia, 11 fichas con Pan + Reanimated, Guardar con PUT /lineups/me, carga con GET; 404 = sin alineación), `features/tactics/{geometry,formations,lineup,frameStats}.ts` (puros), `Pitch.tsx`, `PlayerToken.tsx`, `FpsMeter.tsx` (mide FPS de UI y JS 30 s al tocar el chip), entrada "Pizarra táctica" en Perfil.
Hecho (VERIFICADO por el usuario en Expo Go, Android): "comprobé todo", arrastre de fichas, guardar/cargar y **60 FPS estables** con el medidor de la pantalla. El usuario no pasó las cifras exactas del chip (mín., lentos, JS) ni el modelo del teléfono: `docs/performance/tactical-board.md` lo dice así, sin cifras inventadas.
- Cambio posterior: las fichas muestran la foto del jugador (`PlayerAvatar`, iniciales si no hay foto) en vez del dorsal; portero con borde dorado.
- BD (solo lectura, VERIFICADO): los 677 jugadores tienen overall y las seis estadísticas (`pace`..`physical`, 82 porteros con el significado de portero). El backend aún NO las expone (`PlayerResponse`): base para una futura tarjeta de jugador, no pedida en esta fase.
No probado / pendiente:
- Diferencias con el diseño: chips de formación rectangulares (sin paralelogramo), sin línea discontinua de la posición original (solo círculo fantasma), sin cambiar jugadores por suplentes, botón atrás dice "Perfil" (no existe pestaña Plantilla), el chip FPS es interactivo.
Decisiones clave: posición en SharedValues (hilo de UI) y estado de React solo al soltar; fichas como vistas sobre un Skia estático; normalizado 0..1; guardar solo online con botón.
Archivos principales: `mobile/app/tactics.tsx`, `mobile/src/features/tactics/*`, `mobile/tests/tactics.test.ts`, `docs/defense/canvas.md`, `docs/performance/tactical-board.md`.
Cómo probarlo (PowerShell): `cd mobile; npx expo start --clear`, Expo Go -> Perfil -> Pizarra táctica; arrastrar, cambiar formación, Guardar, salir y volver. FPS: tocar el chip y arrastrar 30 s. Tests: `npm run test:logic; npx tsc --noEmit`.
Siguiente paso: Fase 11 (la define el usuario). Idea pendiente de decidir: pestaña Plantilla + tarjeta de jugador con las 6 estadísticas (677/677 jugadores las tienen); ver `docs/design/player-cards-plan.md`.

## Fase 11 – Admin en la app, prueba integral y defensa – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO por el usuario en Expo Go, Android): "probé todo" (pantallas admin con el torneo de demo). La prueba destapó 2 fallos, ya corregidos (tras corregirlos solo se volvió a ejecutar `tsc`, sin tests nuevos):
- `TextField`: al enfocar añadía sombra/`elevation` al contenedor y en Android el campo perdía el foco (el teclado se abría y se cerraba; login y registro inservibles). Causa NO confirmada con certeza, pero quitar el brillo al enfocar lo arregló (el usuario confirmó que ya escribe). Ahora solo cambia el borde.
- `app/index.tsx`: mandaba a la ruleta a todo no participante, también al admin, que nunca llegaba a Administración (con el torneo ya iniciado: "inscripción cerrada"). Ahora el admin que no juega va a Perfil e Inicio le ofrece el botón Administración.
Hecho (VERIFICADO por mí):
- Tests: backend `pytest` completo **392 passed** (348 herméticos + 44 de integración, 3 min 33 s); `npx tsc --noEmit` limpio; `npm run test:logic` **57 passed** (9 nuevos en `tests/admin.test.ts`); `npx expo export --platform android` empaqueta con las rutas `admin/*`. BD tras los tests de integración: solo `Torneo de prueba` (ACTIVE) y 0 usuarios `it-*`.
- `scripts/demo/setup_demo.py` ejecutado contra el Supabase REAL con el backend local (uvicorn, `API_URL=http://127.0.0.1:8000`): 4 bots, iniciar (12 partidos, 6 fechas), 2 fechas jugadas, 1 disputa y 1 pendiente. Luego `--teardown --yes`: borró eventos y torneo sin error y `Torneo de prueba` volvió a ser el actual (autorizado por el usuario).
- Flujo admin por API (mismo backend): participante en `/admin/matches` -> 403 `FORBIDDEN`; activar con fecha abierta -> 409 `ROUND_NOT_CLOSED`; iniciar otra vez -> 409 `TOURNAMENT_ALREADY_STARTED`; resolver disputa y pendiente -> RESOLVED; resolver dos veces -> 409 `INVALID_TRANSITION`; marcador 100 -> 422; activar siguiente fecha -> ronda 4 (2 partidos); tabla coincide con el cálculo a mano (PTS 6/5/4/1).
- App: `mobile/app/admin/index.tsx` (estado del torneo, participantes, iniciar torneo, activar fecha, cola de pendientes y disputas), `mobile/app/admin/matches/[id].tsx` (resolver: marcador calculado, versión del local, estado del visitante, marcador oficial y nota), entrada "Administración" en Perfil solo con rol admin, `features/admin/{derive,hooks}.ts`, `components/BackHeader.tsx`. Backend sin cambios.
- Docs: `docs/defense/INDEX.md` (arquitectura, recorrido de un evento, 20 preguntas), `docs/defense/admin.md`, `README.md` (Windows + aviso de derechos y fuente de datos).
No probado / pendiente:
- No hay diseño `13-admin.png`/`14-disputa.png`: las pantallas admin siguen `design-system.md`. El usuario no detalló qué pasos concretos probó ni si anotó diferencias visuales.
- Sin pestaña Plantilla (pendiente de fases anteriores). El admin no recibe por WebSocket los rechazos del visitante (van a los 2 jugadores): su cola de pendientes se refresca con sondeo de 10 s y al tirar para refrescar.
- README en otra máquina / contra un Supabase nuevo: NO probado. `setup_demo.py` con `--yes` sin `--start` (solo DRAFT) lo usó el usuario, no consta que lo ejecutara yo. La clave secreta de Supabase sigue sin rotar (decisión del usuario, solo se puede hacer en el panel).
- Pendientes de mi lado, después del cierre (VERIFICADO por mí): (1) clon limpio en carpeta nueva siguiendo el README: `venv` + `pip install` + hermético 348 passed, `npm install` (601 paquetes) + `tsc` 0 + 57 tests. Destapó un hueco real: sin `backend/.env` el hermético fallaba al recolectar (`app.main` lee `Settings` al importarse); arreglado con `backend/tests/conftest.py` (valores falsos solo si falta el `.env`; con `.env` no hace nada) -> clon sin `.env`: 348 passed y 44 de integración saltados. (2) Tabla en vivo: el servidor entrega `STANDINGS_UPDATED` por WebSocket (`test_realtime_real.py`, ya en los 392) y la app lo traduce a refetch (nuevos `mobile/tests/invalidation.test.ts`, 8 tests con `QueryClient` real; `queryKeys` movido a `src/api/queryKeys.ts` para poder probarlo): 65 passed. NO observado en el teléfono. (3) Historial de git sin claves `sb_secret_`/JWT ni contraseñas de BD (solo placeholders `YOUR-PROJECT-REF`); `.env` y `demo.env` no están versionados.
Decisiones clave: el servidor decide y la app solo refleja (botones deshabilitados como pista; 409 se muestra tal cual); `setup_demo.py` es plan-por-defecto y exige `--yes`, solo borra el torneo con nombre exacto; reutiliza `room_helper` y `create_users`.
Archivos principales: `mobile/app/admin/*`, `mobile/src/features/admin/*`, `scripts/demo/setup_demo.py`, `docs/defense/INDEX.md`, `README.md`.
Cómo probarlo (PowerShell, raíz): `cd backend; .\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000`; en otra ventana `$env:API_URL="http://127.0.0.1:8000"; backend\venv\Scripts\python.exe scripts\demo\setup_demo.py 4 --yes --start --play-rounds 2 --dispute`; `cd mobile; npx expo start --clear` (con `EXPO_PUBLIC_API_URL` = IP del PC), entrar como `admin@example.com` -> Perfil -> Administración. Al terminar: `setup_demo.py --teardown --yes`. Tests: `cd mobile; npx tsc --noEmit; npm run test:logic`.
Siguiente paso: repaso de defensa con `docs/defense/INDEX.md`; entrega 6 de octubre de 2026. `Torneo de demo` ya se borró (`--teardown`): el torneo actual vuelve a ser `Torneo de prueba` (ACTIVE, ronda 4). Despertar Render antes de la defensa (~50 s).
