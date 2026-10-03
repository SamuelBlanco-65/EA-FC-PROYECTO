# Progreso del proyecto

Fases 0-8 cerradas (0 PARCIAL: faltan QR y Expo Go). Siguiente: Fase 9, cuando el usuario la indique.
Aquí solo las 2 últimas fases; las anteriores están en `docs/progress-archive.md`.

## Fase 8 – App: base, auth, ruleta, home, tabla, calendario – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- Backend: `GET /participants/me` (solo lectura, no inscribe) y `GET /media/crests/{id}` + `/media/players/{id}` (JWT, PNG del bucket privado, ETag/304, `Cache-Control: private`). 348 passed sin integración; `tests/integration/test_app_flow_real.py` 6 passed contra Supabase real. Desplegado en Render y comprobado en la URL pública: login, `/participants/me` 403, `/tournament`, escudo 200 + 304 + anónimo 401, refresh, wss `AUTH_OK` (1,3 s).
- App: `npx tsc --noEmit` limpio; `npx expo export --platform android` empaqueta (Hermes); lógica pura (`derive.ts`, `validation.ts`, `events.ts`) ejecutada con aserciones. Paquetes con `expo install` (ver `docs/VERSIONES.md`).
- Hecho: tema desde `design-system.md`, cliente API con refresh en 401, sesión en SecureStore, caché persistida (AsyncStorage), Zustand (sesión/conexión), Login, Registro, Ruleta (Skia+Reanimated, el servidor elige), Home, Tabla, Calendario, Perfil mínimo (solo cerrar sesión), `RealtimeService` + banner, `ClubCrest`/`PlayerAvatar` (expo-image, caché en disco, iniciales).
- BD: creé a propósito 1 torneo `Torneo de prueba` (DRAFT) para tu prueba; 0 usuarios `it-*` huérfanos.
- VERIFICADO por el usuario en Expo Go (Android): registro -> ruleta -> club asignado -> vistas; escudos reales en Inicio, Tabla y Perfil; modo avión: tabla y calendario desde caché tras cerrar y reabrir; banner "Sin conexión" y chip "En línea" al volver la red.
- Corregido tras la prueba: aviso de Skia (`SkPath.moveTo` obsoleto -> `Skia.PathBuilder`) y escudos invisibles (el contenedor con `overflow: hidden` + borde discontinuo recortaba la imagen en Android; ahora el placeholder es un hermano y no hay recortes). Perfil: añadida tarjeta "Mi club" con escudo.
No probado / pendiente:
- NO PROBADO: Calendario con partidos (eres el único inscrito, no hay fixtures), WebSocket recibiendo avisos reales en la app, arranque en frío de Render (el cliente espera hasta 60 s). Quedan logs `[media]` solo en desarrollo (`__DEV__`) en `ClubCrest.tsx`; quitarlos cuando no hagan falta.
- Hex y fuentes del diseño siguen siendo estimaciones (no muestreados). Sin: pestaña Plantilla, botón "Entrar a la sala" (Fase 9), "¿Olvidaste tu contraseña?" (no hay endpoint), confeti. Aún no hay endpoint para crear torneos (el `Torneo de prueba` DRAFT lo creé por SQL y sigue en la BD); la clave secreta de Supabase sigue pendiente de rotar (decisión tuya).
Decisiones clave: caché de TanStack Query persistida (no copiar datos a Zustand); `/participants/me` aparte de `assign-club`; `/media` con JWT y caché por URL sin token; Home compuesto en cliente con funciones puras (sin `/home`).
Archivos principales: `mobile/app/**`, `mobile/src/{api,stores,realtime,theme,components,features}`, `backend/app/{api/media.py,services/media_service.py,repositories/media_repository.py}`, `docs/defense/app-base.md`.
Cómo probarlo (PowerShell): `cd mobile; npx expo start --clear` y abrir con Expo Go (la URL está en `mobile/.env`: `EXPO_PUBLIC_API_URL=https://ea-fc-api.onrender.com`). Tests: `cd backend; .\venv\Scripts\python.exe -m pytest -m "not integration"`; `cd mobile; npx tsc --noEmit`.
Siguiente paso: Fase 9 (la define el usuario).

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
