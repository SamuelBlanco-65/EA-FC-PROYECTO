# Progreso del proyecto

Fase actual: 1 completada. Fase 0 sigue PARCIAL en dos comprobaciones manuales (QR y Expo Go). Siguiente: Fase 2 (cuando el usuario la indique).

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
