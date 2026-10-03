# Progreso del proyecto

Fases 0-10 cerradas (0 PARCIAL: faltan QR y Expo Go). Fase 11 PARCIAL: todo hecho y verificado salvo la prueba de las pantallas admin en el teléfono.
Aquí solo las 2 últimas fases; las anteriores están en `docs/progress-archive.md`.

## Fase 11 – Admin en la app, prueba integral y defensa – 2026-10-03
Estado: PARCIAL (pantallas admin NO probadas en el teléfono; el resto VERIFICADO)
Hecho (VERIFICADO por mí):
- Tests: backend `pytest` completo **392 passed** (348 herméticos + 44 de integración, 3 min 33 s); `npx tsc --noEmit` limpio; `npm run test:logic` **57 passed** (9 nuevos en `tests/admin.test.ts`); `npx expo export --platform android` empaqueta con las rutas `admin/*`. BD tras los tests de integración: solo `Torneo de prueba` (ACTIVE) y 0 usuarios `it-*`.
- `scripts/demo/setup_demo.py` ejecutado contra el Supabase REAL con el backend local (uvicorn, `API_URL=http://127.0.0.1:8000`): 4 bots, iniciar (12 partidos, 6 fechas), 2 fechas jugadas, 1 disputa y 1 pendiente. Luego `--teardown --yes`: borró eventos y torneo sin error y `Torneo de prueba` volvió a ser el actual (autorizado por el usuario).
- Flujo admin por API (mismo backend): participante en `/admin/matches` -> 403 `FORBIDDEN`; activar con fecha abierta -> 409 `ROUND_NOT_CLOSED`; iniciar otra vez -> 409 `TOURNAMENT_ALREADY_STARTED`; resolver disputa y pendiente -> RESOLVED; resolver dos veces -> 409 `INVALID_TRANSITION`; marcador 100 -> 422; activar siguiente fecha -> ronda 4 (2 partidos); tabla coincide con el cálculo a mano (PTS 6/5/4/1).
- App: `mobile/app/admin/index.tsx` (estado del torneo, participantes, iniciar torneo, activar fecha, cola de pendientes y disputas), `mobile/app/admin/matches/[id].tsx` (resolver: marcador calculado, versión del local, estado del visitante, marcador oficial y nota), entrada "Administración" en Perfil solo con rol admin, `features/admin/{derive,hooks}.ts`, `components/BackHeader.tsx`. Backend sin cambios.
- Docs: `docs/defense/INDEX.md` (arquitectura, recorrido de un evento, 20 preguntas), `docs/defense/admin.md`, `README.md` (Windows + aviso de derechos y fuente de datos).
No probado / pendiente:
- Las pantallas admin NO se han visto en Expo Go (no hay diseño `13-admin.png`/`14-disputa.png`: seguí `design-system.md`). La "prueba manual completa" fue por API/scripts, no con el teléfono.
- Sin pestaña Plantilla (pendiente de fases anteriores). El admin no recibe por WebSocket los rechazos del visitante (van a los 2 jugadores): su cola de pendientes se refresca con sondeo de 10 s y al tirar para refrescar.
- La instalación desde cero (README) no se probó en otra máquina. `setup_demo.py` con `--yes` sin `--start` (solo DRAFT) no se ejecutó.
Decisiones clave: el servidor decide y la app solo refleja (botones deshabilitados como pista; 409 se muestra tal cual); `setup_demo.py` es plan-por-defecto y exige `--yes`, solo borra el torneo con nombre exacto; reutiliza `room_helper` y `create_users`.
Archivos principales: `mobile/app/admin/*`, `mobile/src/features/admin/*`, `scripts/demo/setup_demo.py`, `docs/defense/INDEX.md`, `README.md`.
Cómo probarlo (PowerShell, raíz): `cd backend; .\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000`; en otra ventana `$env:API_URL="http://127.0.0.1:8000"; backend\venv\Scripts\python.exe scripts\demo\setup_demo.py 4 --yes --start --play-rounds 2 --dispute`; `cd mobile; npx expo start --clear` (con `EXPO_PUBLIC_API_URL` = IP del PC), entrar como `admin@example.com` -> Perfil -> Administración. Al terminar: `setup_demo.py --teardown --yes`. Tests: `cd mobile; npx tsc --noEmit; npm run test:logic`.
Siguiente paso: probar las pantallas admin en el teléfono (y corregir lo que salga); entrega 6 de octubre de 2026.

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
