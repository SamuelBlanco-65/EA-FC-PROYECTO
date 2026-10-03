# Progreso del proyecto

Fase actual: 3 completada y verificada contra Supabase real (25 clubes, 677 jugadores sembrados). Fase 0 sigue PARCIAL en dos comprobaciones manuales (QR y Expo Go). Siguiente: Fase 4 (cuando el usuario la indique).

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
