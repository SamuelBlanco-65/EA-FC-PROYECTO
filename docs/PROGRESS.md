# Progreso del proyecto

Fases 0-8 cerradas (0 PARCIAL: faltan QR y Expo Go). Fase 9 PARCIAL: código y lógica verificados, faltan las pruebas en el teléfono (abajo).
Aquí solo las 2 últimas fases; las anteriores están en `docs/progress-archive.md`.

## Fase 9 – Sala de partido horizontal + cola offline – 2026-10-03
Estado: PARCIAL (falta la prueba guiada en el teléfono; la haces tú)
Hecho (VERIFICADO):
- `npx tsc --noEmit` limpio; `npx expo export --platform android` empaqueta; `npm run test:logic` 14 passed (cola: persistencia y recuperación, orden, fallo transitorio, rechazo definitivo sin bloquear, ráfagas concurrentes, caída entre "servidor aceptó" y "cola olvidó" sin duplicar contra un servidor simulado idempotente; derivaciones de la sala). Backend intacto: 348 passed sin integración. BD sin tocar (0 tests de integración ejecutados; sigue el `Torneo de prueba` DRAFT con 1 participante).
- Hecho: `app/match/[id].tsx` (marcador, eventos en vivo, TU EQUIPO / OPONENTE, Gol/Amarilla/Roja con jugador + minuto, Finalizar del local con confirmación, `ResultModal` Confirmar/Rechazar del visitante, barra "Sin conexión – N eventos pendientes"), `offline/eventQueue.ts` + `queue.ts` (cola en AsyncStorage, envío en orden, backoff), disparadores en `useAppRuntime.ts` (red, WebSocket, primer plano), botón "Entrar a la sala" en Inicio y Calendario, `scripts/demo/room_helper.py` para la prueba guiada (solo `status` ejecutado, lectura).
No probado / pendiente:
- NO PROBADO en el teléfono: giro a horizontal en Expo Go (con `orientation: "portrait"` en `app.json`; plan B en `docs/VERSIONES.md`), teclado numérico del minuto en horizontal, escudos/fotos en la sala, aspecto de los modales, caso aprobado, caso rechazado, modal del visitante, prueba en modo avión (2 goles, llegan 1 vez).
- Diferencia con el diseño: el chip "Ahora" del minuto se llama "Último" (no hay reloj de partido; vale el último minuto registrado). Sin pestaña Plantilla. Un envío tras dormir Render puede tardar hasta 60 s. La cola se borra al cerrar sesión.
Decisiones clave: siempre encolar (con y sin red) para un único camino y orden garantizado; idempotencia por UUID del cliente en el servidor; AsyncStorage en vez de SQLite; 4xx definitivo = "rechazado" visible, no bloquea la cola.
Archivos principales: `mobile/app/match/[id].tsx`, `mobile/src/features/match/*`, `mobile/src/offline/*`, `mobile/tests/logic.test.ts`, `scripts/demo/room_helper.py`, `docs/defense/offline.md`.
Cómo probarlo (PowerShell, raíz del repo; guion completo en el último mensaje de la sesión):
`$env:API_URL="https://ea-fc-api.onrender.com"; backend\venv\Scripts\python.exe scripts\demo\room_helper.py setup` (inscribe participant02/03, inicia el torneo, activa la fecha 1), luego `status`, `advance`, `play-home`, `resolve`, `events`; bot: `backend\venv\Scripts\python.exe scripts\demo\visitor_bot.py --email participant02@example.com --approve`. Tests: `cd mobile; npm run test:logic; npx tsc --noEmit`.
Siguiente paso: tu prueba en el teléfono; con el resultado actualizo esta fase a COMPLETA (o corrijo). Después, Fase 10.

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
