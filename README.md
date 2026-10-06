# EA FC Tournament – Companion App (FC ARENA)

Aplicación móvil complementaria e infraestructura en tiempo real para gestionar un torneo de **EA Sports FC** entre amigos: inscripción con ruleta de club, liga todos contra todos de ida y vuelta, sala de partido en vivo con validación cruzada entre rivales, tabla en tiempo real, panel de administración y pizarra táctica.

Proyecto académico **individual** de *Desarrollo Móvil* (Evaluación Parcial V2). Entrega: 6 de octubre de 2026. El enunciado está en [`docs/enunciado.md`](docs/enunciado.md).

> **Regla de arquitectura:** el frontend nunca habla con la base de datos. La app solo conoce la URL del backend (`EXPO_PUBLIC_API_URL`); no contiene ninguna clave de Supabase.

```
App móvil (Expo, TypeScript) --HTTPS REST + WSS--> Backend propio (Python, FastAPI) --supabase-py / Postgres--> Supabase
                                                          ^                                                        |
                                                          +------ Supabase Realtime (postgres_changes) ------------+
```

## Qué incluye (por módulo del enunciado)

| Módulo | Qué hace | Dónde está |
|---|---|---|
| **1. Ingesta y autenticación** | Scraping/seed de los planteles de los **top 5 de las 5 grandes ligas** (25 clubes, 677 jugadores, escudos y fotos). Registro e inicio de sesión por participante y **ruleta animada** que asigna un club de forma pseudoaleatoria y persistente (el sorteo lo hace el servidor, de forma atómica). | `scraper/`, `backend/app/api/auth.py`, `mobile/app/roulette.tsx` |
| **2. Liga y calendario** | Calendario **ida y vuelta** (método del círculo), puntuación 3/1/0 con diferencia de goles, tabla en tiempo real y **panel de administración** (iniciar torneo y habilitar las fechas en orden). | `backend/app/domain/round_robin.py`, `mobile/app/(tabs)/admin.tsx` |
| **3. Sala de partido en vivo** | Vista **horizontal** para registrar goles y tarjetas (solo del equipo propio), finalización por el local, **aprobación o rechazo del visitante por WebSocket** y estado de **disputa** que resuelve el administrador. | `mobile/app/match/[id].tsx`, `backend/app/realtime/`, `backend/app/domain/match_state.py` |
| **4. Pizarra táctica** | Arrastrar y soltar fichas sobre un campo dibujado en **Canvas (Skia)**, con límites de pantalla, formaciones reasignables y medición de FPS. | `mobile/app/tactics.tsx`, `mobile/src/features/tactics/` |
| **Extra: offline** | Lectura desde caché persistida y **cola de eventos sin conexión** con UUID del cliente; el servidor es idempotente, así que reenviar no duplica. | `mobile/src/offline/` |

## Tecnología

- **Backend:** Python 3.12, FastAPI, Pydantic, supabase-py, cliente Realtime asíncrono, pytest. Capas: router → service → domain (funciones puras) → repository.
- **Base de datos:** Supabase (Postgres, Auth, Storage, Realtime) con **RLS en todas las tablas**, migraciones SQL y funciones atómicas.
- **App:** Expo + TypeScript + Expo Router, TanStack Query, Zustand, Skia, Reanimated, Gesture Handler y `expo-secure-store`. Se ejecuta en **Expo Go (Android)**.
- **Despliegue:** backend en Render (HTTPS/WSS). Ver `render.yaml` y `docs/defense/deploy.md`.

## Seguridad en breve

- El backend valida el JWT en cada petición y lee el rol de `profiles`, nunca del cliente.
- Dos candados: reglas en el servicio y **RLS en Postgres**. Sin ninguna política para `anon`.
- Las contraseñas las gestiona Supabase Auth (hash bcrypt). Las claves viven solo en `backend/.env` y en el panel de Render; **no están en el repositorio ni en su historial** (verificado antes de la entrega).

## Estado del proyecto

- **Backend:** 350 tests herméticos pasan (`pytest -m "not integration"`). Además hay 44 tests de integración contra Supabase real, que escriben y limpian sus propios datos.
- **App:** `tsc --noEmit` limpio y 112 tests de lógica pasan (`npm run test:logic`).
- **Probado en un teléfono Android real (Expo Go):** registro, ruleta, tabla, calendario, sala horizontal, aprobación y rechazo de resultados, modo avión con cola offline, pizarra a 60 FPS y pantallas de administración.
- **Cambios recientes aún sin probar en el teléfono:** rediseño visual v2, Plantilla, tarjeta de jugador, detalle de partido, camino de la temporada en Inicio y pestaña de Administración. Ver `docs/PROGRESS.md` para el detalle de lo verificado y lo pendiente.
- **Límites conocidos:** el torneo se crea por SQL (no hay endpoint), el estado `FINISHED` no se alcanza al cerrar la última fecha, no hay recuperación de contraseña ni verificación de correo (torneo cerrado entre conocidos), y el plan gratuito de Render se duerme tras unos minutos sin tráfico (el primer arranque tarda hasta ~1 min).
- **Ramas:** `master` es la versión estable v1 que despliega Render; `plantilla-detalle` contiene además el rediseño v2 y la Fase 13.

## Documentación

- [`docs/PROGRESS.md`](docs/PROGRESS.md): estado real, qué está verificado y qué falta.
- [`docs/defense/INDEX.md`](docs/defense/INDEX.md): arquitectura en una página, recorrido de un evento de punta a punta y preguntas probables de la defensa (más una ficha por módulo).
- [`docs/architecture/`](docs/architecture/), [`docs/database/`](docs/database/), [`docs/domain/`](docs/domain/), [`docs/scraping/scraping.md`](docs/scraping/scraping.md): decisiones técnicas.
- [`docs/design/`](docs/design/): sistema de diseño v2 (tokens, componentes, plan por pantalla).

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
mobile/     app/ (Expo Router)  src/{api,features,stores,realtime,offline,theme,components}/  tests/  eas.json
scraper/    parsers, normalización, validación y seed
supabase/   migrations/*.sql
scripts/    db/ (migraciones y comprobaciones)  demo/ (cuentas, torneo de demo, bots)  deploy/ (verificación del despliegue)
config/     tournament-clubs.json (los 25 clubes)
docs/       PROGRESS.md  enunciado.md  defense/  design/  architecture/  database/  domain/  scraping/  performance/
render.yaml (despliegue del backend en Render)
```
