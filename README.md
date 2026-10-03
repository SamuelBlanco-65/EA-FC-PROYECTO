# EA FC Tournament – Companion App (FC ARENA)

Proyecto académico individual (Desarrollo Móvil). App móvil (Expo, TypeScript) + backend propio (Python, FastAPI) + Supabase (Postgres, Auth, Storage, Realtime). La app nunca habla con la base de datos: solo conoce la URL del backend.

```
App móvil --HTTPS REST + WSS--> Backend FastAPI --supabase-py / Postgres--> Supabase
                                      ^                                          |
                                      +------ Supabase Realtime -----------------+
```

Documentación: `CLAUDE.md` (reglas del proyecto), `docs/PROGRESS.md` (estado real), `docs/defense/INDEX.md` (arquitectura, recorrido de un evento y preguntas de defensa), `docs/design/` (sistema de diseño), `docs/scraping/scraping.md` (origen de los datos).

## Aviso sobre datos e imágenes

Uso **académico, no comercial**. Los escudos, nombres y fotos de clubes y jugadores, y las valoraciones de EA SPORTS FC, pertenecen a sus respectivos titulares (clubes, ligas, Electronic Arts y demás propietarios de marcas); este proyecto no tiene relación con ellos ni está aprobado por ellos. No se redistribuyen los datos ni las imágenes: los archivos originales no están en el repositorio y la app solo los muestra a los usuarios de la demo.

**Fuente de los datos:** las plantillas, valoraciones, estadísticas, escudos y fotos proceden de SoFIFA (guardadas a mano desde el navegador; no hay scraping automatizado, ver `docs/scraping/scraping.md`) y las clasificaciones finales 2025-26 que definen los 25 clubes, de Wikipedia. Si eres titular de algún contenido y quieres que se retire, se elimina.

## Requisitos (Windows 11, PowerShell)

- Python 3.12 (el venv del proyecto es 3.12.0; ver `docs/VERSIONES.md`), Node.js 20 y npm, Git.
- Un proyecto de Supabase con las migraciones aplicadas (más abajo).
- Un teléfono Android con **Expo Go**, en la misma red Wi-Fi que el PC (no se usa Android Studio ni development build).

Probado en un clon limpio del repositorio (misma máquina, carpeta nueva): `venv` + `pip install`, tests herméticos, `npm install`, `tsc` y tests de la app. NO probado: arrancar el backend y la app contra un proyecto de Supabase nuevo, ni en otra máquina.

## 1. Backend

```powershell
cd backend
py -3.12 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Crea `backend\.env` (está en `.gitignore`; nunca se sube ni va a la app):

```
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...        # solo backend: salta la RLS
DATABASE_URL=...               # solo para aplicar migraciones (Session pooler, puerto 5432)
# opcionales: LOG_LEVEL=INFO, REALTIME_LISTENER_ENABLED=true, CORS_ORIGINS=
```

Arranque local (desde `backend\`):

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Comprobación: `http://127.0.0.1:8000/health` -> `{"status":"ok"}`. Documentación interactiva de la API en `/docs`. En producción el backend corre en Render (`render.yaml`, ver `docs/defense/deploy.md`).

## 2. Base de datos y datos iniciales

Desde la raíz del repo:

```powershell
backend\venv\Scripts\python.exe scripts\db\apply_migrations.py            # aplica las pendientes (idempotente)
backend\venv\Scripts\python.exe scripts\db\apply_migrations.py --status
```

Datos de clubes y jugadores (el HTML de SoFIFA guardado a mano va en `scraper\data\raw\sofifa\<club>\`, ver `docs/scraping/scraping.md`):

```powershell
backend\venv\Scripts\python.exe -m pip install -r scraper\requirements.txt
backend\venv\Scripts\python.exe -m scraper.pipeline      # normaliza y valida (25 clubes)
backend\venv\Scripts\python.exe -m scraper.seed          # sube a Supabase (upsert, repetible)
```

## 3. App móvil

```powershell
cd mobile
npm install
copy .env.example .env
```

Edita `mobile\.env`: `EXPO_PUBLIC_API_URL` con la URL de Render o, para un backend local, la **IP de tu PC en la red** (no `localhost`), por ejemplo `http://192.168.1.50:8000`. Luego:

```powershell
npx expo start --clear
```

Escanea el QR con Expo Go. Si cambias `.env`, reinicia con `--clear`.

## 4. Cuentas y torneo de demostración

Cuentas de prueba (1 admin + participantes). Copia `scripts\demo\demo.env.example` a `scripts\demo\demo.env` (ignorado por git) y elige contraseñas, o expórtalas como variables de entorno:

```powershell
backend\venv\Scripts\python.exe scripts\demo\create_users.py 5
```

Crea `admin@example.com` y `participant01..05@example.com` (idempotente: restablece la contraseña a la configurada).

Torneo de demo con participantes simulados (los bots son `participant02..`; `API_URL` apunta al backend que uses):

```powershell
$env:API_URL = "http://127.0.0.1:8000"
backend\venv\Scripts\python.exe scripts\demo\setup_demo.py 4                       # solo muestra el plan (no escribe)
backend\venv\Scripts\python.exe scripts\demo\setup_demo.py 4 --yes                 # torneo en inscripción con 4 bots
backend\venv\Scripts\python.exe scripts\demo\setup_demo.py 4 --yes --start --play-rounds 2 --dispute
backend\venv\Scripts\python.exe scripts\demo\setup_demo.py --teardown --yes        # borra el torneo de demo
```

`setup_demo.py` borra únicamente los torneos con el nombre exacto `Torneo de demo` y crea uno nuevo, que pasa a ser el torneo **actual** (el más reciente): los demás torneos no se tocan pero la app muestra el nuevo hasta ejecutar `--teardown`. Escribe en el Supabase al que apunta `backend\.env`. Otras ayudas en `scripts\demo\`: `room_helper.py` (jugar las demás partidas mientras pruebas la sala), `visitor_bot.py`, `simulate_match.py`.

Administración en la app: inicia sesión con `admin@example.com` -> Perfil -> **Administración** (estado del torneo, participantes, iniciar torneo, activar siguiente fecha, partidos pendientes y disputas, resolver disputa).

## 5. Tests

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest -m "not integration"     # hermético: no toca la base de datos
.\venv\Scripts\python.exe -m pytest -m integration           # ESCRIBE en el Supabase real y limpia al terminar
cd ..\mobile
npx tsc --noEmit
npm run test:logic
```

Los tests herméticos funcionan en un clon nuevo **sin** `backend\.env` (usan valores falsos y no tocan la red); sin `.env` los de integración se saltan. Los de integración crean y borran sus propios torneos y usuarios `it-*`: comprueba después que no queden huérfanos.

## Estructura

```
backend/    app/{api,core,domain,repositories,services,realtime,schemas}/  tests/
mobile/     app/ (Expo Router)  src/{api,features,stores,realtime,offline,theme,components}/
scraper/    parsers, normalización, validación y seed
supabase/   migrations/*.sql
scripts/    db/ (migraciones y comprobaciones)  demo/ (cuentas, torneo de demo, bots)
config/     tournament-clubs.json (los 25 clubes)
docs/       PROGRESS.md  defense/  design/  architecture/  scraping/
```
