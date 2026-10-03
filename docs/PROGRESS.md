# Progreso del proyecto

Fases 0-7 cerradas (0 PARCIAL: faltan QR y Expo Go). Siguiente: Fase 8, cuando el usuario la indique.
Aquí solo las 2 últimas fases; las anteriores están en `docs/progress-archive.md`.

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
