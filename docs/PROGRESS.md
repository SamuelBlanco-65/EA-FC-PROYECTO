# Progreso del proyecto

Fases 0-9 cerradas (0 PARCIAL: faltan QR y Expo Go). Fase 10 COMPLETA (probada por el usuario en el teléfono).
Aquí solo las 2 últimas fases; las anteriores están en `docs/progress-archive.md`.

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
