# Progreso del proyecto

Fases 0-13 cerradas (0 PARCIAL: faltan QR y Expo Go). Fases 12 y 13: código y tests VERIFICADOS por mí; falta que el usuario pruebe en el teléfono lo marcado como NO probado.
Aquí solo las 2 últimas fases; las anteriores están en `docs/progress-archive.md`.

## Cambios posteriores a la Fase 13 (solo app, 2026-10-06) – rama `plantilla-detalle`
Estado: hechos y comprobados con `tsc` limpio, `npm run test:logic` 112 passed (+5 de `seasonTrail.test.ts`) y `expo export` OK; NO probados en el teléfono. Backend sin cambios.
- Retoque visual: bordes, sombras y tintes del naranja de marca en Card, Scorebug, botones, filas de Plantilla/Calendario/Inicio/Perfil, tarjeta de jugador (barras por nivel) y hojas; transición de pestañas más suave; leyenda de la Tabla rediseñada.
- Inicio: "camino de la temporada" en zigzag (`features/tournament/SeasonTrail.tsx`, lógica pura `seasonTrail` en `derive.ts`) con tu resultado por fecha y una copa al final.
- Admin que no juega: pestaña "Administración" (`app/(tabs)/admin.tsx`, movida desde `app/admin/index.tsx`); se ocultan Inicio y Plantilla para él. Participantes y admin que sí juega no cambian.
- `mobile/eas.json` y `android.package` (`com.eafc.tournament`) para un APK con EAS Build (`preview`). El build quedó en cola del plan gratuito: NO hay APK verificado.
- BD real (solo demo): `Torneo de demo` con 15 participantes, fechas 1-16 jugadas y la 17 activa. Los partidos del presentador se rellenaron directamente en la BD (atajo de demo, con eventos pero sin pasar por la API); los de los bots, por la API. `Torneo de prueba` sin tocar.
- Auditoría antes de entregar: los valores reales de `backend/.env`, `demo.env` y `mobile/.env` no aparecen ni en los archivos ni en el historial de git.

## Fase 13 – Detalle de partido, Plantilla, tarjeta de jugador y elegir titulares – 2026-10-05
Estado: COMPLETA en código (rama `plantilla-detalle`); pruebas en el teléfono PENDIENTES (ver abajo)
Hecho (VERIFICADO por mí): backend hermético 350 passed (348 + 2); `npx tsc --noEmit` limpio; `npm run test:logic` 107 passed (22 nuevos); `npx expo export --platform android` empaqueta.
- Paso 1 Detalle (`app/match-detail/[id].tsx`, `features/match/detail.ts`): se abre desde Calendario ("Tu partido" y filas) e Inicio; usa `GET /matches/{id}` (un participante lee partidos ajenos: VERIFICADO con un bot en la BD real). Refresco en vivo leído en `realtime/invalidation.ts`: eventos y cambios de resultado sí; la activación de fecha NO (solo tirar para refrescar).
- Paso 2 Plantilla (`app/(tabs)/squad.tsx`, `features/squad/groups.ts`): pestaña 5, solo mi club (`GET /me/squad`); la Pizarra se abre desde ahí.
- Paso 3 Tarjeta: backend expone `pace..physical` en `PlayerResponse` (commit `e211e38`; en `master` como `c2d9796`); app: `PlayerCard.tsx` (hoja inferior), `stats.ts` (etiquetas de portero), `CACHE_BUSTER` v2. BD real, solo lectura: 28 jugadores con las 6 estadísticas entre 1 y 99. Render ya sirve los campos (VERIFICADO tras el push a `master`).
- Paso 4 Titulares: `LineupSheet.tsx` ("Cambios": titular + suplente se intercambian), `swapPlayers`/`benchOf` en `lineup.ts` (9 tests). `Pitch.tsx` y `PlayerToken.tsx` sin tocar.
Verificado por el usuario: la tarjeta se abre. Mostraba "–" porque Render tenía el backend antiguo; desde el despliegue NO ha confirmado que las cifras ya salen.
No probado / pendiente: Detalle, Plantilla y "Cambios" en el teléfono; dos modales a la vez (tarjeta sobre "Cambios"); FPS de la Pizarra NO remedidos (el campo es una línea más corto); el Detalle no muestra eventos de la cola offline; `Torneo de demo` activo en la BD real (ver Siguiente paso).
Decisiones clave: "Cambios" es una hoja y no listas bajo el campo (no meter la Pizarra en un ScrollView por los gestos); `null` y no 0 para estadísticas ausentes; las etiquetas de portero viven en el cliente; el backend se desplegó con SOLO su commit (rama `backend-player-stats` y avance simple de `master`), sin el rediseño.
Archivos principales: `mobile/app/match-detail/[id].tsx`, `mobile/app/(tabs)/squad.tsx`, `mobile/src/features/{squad,tactics}/*`, `backend/app/{domain/match.py,repositories/player_repository.py,schemas/match.py}`, `docs/defense/player-card.md`.
Cómo probarlo (PowerShell): `cd backend; .\venv\Scripts\python.exe -m pytest -m "not integration"`; `cd mobile; npx tsc --noEmit; npm run test:logic; npx expo export --platform android`; app: `npx expo start --clear`, entrar con `participant03@example.com` (contraseña en `scripts\demo\demo.env`), Plantilla -> tocar jugador -> Pizarra -> Cambios; Calendario -> tocar un partido.
Siguiente paso: (1) probar en el teléfono; (2) decidir con qué rama se entrega: `master` (defendible, ya lleva solo el backend nuevo) o `plantilla-detalle` (todo; contiene `e211e38`, el mismo parche que `c2d9796` de `master`: al mezclar debería reconocerlo, NO probado); (3) `Torneo de demo` (ACTIVE, ronda 1, bots 02-05 + "Samuel BLANCO", Aston Villa 2-1 Marseille CONFIRMED) oculta el `Torneo de prueba` mientras exista: `setup_demo.py --teardown --yes` con un backend en marcha lo devuelve; `participant06` fue creada y no está inscrita.

## Fase 12 – Rediseño visual v2 (dirección A, transmisión de TV) – 2026-10-05
Estado: COMPLETA en código (ramas `redesign-v2` y `plantilla-detalle`); prueba visual del usuario parcial ("Listo" tras la demo, sin detalle)
Hecho (VERIFICADO por mí): tras cada paso `tsc` limpio, `test:logic` y `expo export` OK (65 -> 78 passed; el único test nuevo de la fase es `clubColors.test.ts`). Solo capa de presentación: sin cambios en `backend/`, `supabase/`, `scripts/`, `mobile/src/{api,stores,offline,realtime}` ni hooks (VERIFICADO con `git diff master`).
- P0 tokens (`theme/palette.ts`, `typeV2`, fuentes Big Shoulders + Inter, `clubColors.ts` con `readableOnInk`); P1 componentes planos y `Scorebug`, sin `ScreenBackground` Skia; P2 Tabla; P3 Inicio; P4 Calendario y Perfil; P5 Login/Registro (`TextField` solo cambia el color del borde); P6 Sala y modales (lógica y cola offline intactas); P7 movimiento y hápticos; P8 Admin, Resolver y chrome de la Pizarra (chip FPS solo en `__DEV__`); P9 Ruleta con revelación.
No probado / pendiente: fuentes, hápticos, `slide_from_right` y fundido de pestañas en el teléfono (el usuario no detalló); FPS de la Sala y la Pizarra NO medidos tras quitar el Canvas de fondo; colores de club de 25 clubes estimados de memoria; ancho del `Scorebug` y de los botones de la Sala solo calculados para ~915 dp; `Wheel` (Skia) sigue con colores v1 (decisión del documento); tokens v1 siguen en `tokens.ts`; cuenta ascendente solo en Inicio; el chip FPS se ve en Expo Go (`__DEV__`).
Decisiones clave: tokens v2 conviven con los v1 (no se rompen pantallas sin migrar); un solo color de marca (`signal`); `Scorebug` como núcleo; fundido al recuperar foco en `Screen` (las pestañas siguen montadas); sin barra de color de club en Calendario (un partido tiene dos clubes).
Archivos principales: `mobile/src/theme/*`, `mobile/src/components/*`, `mobile/app/**`, `docs/design/{design-system-v2,screens-v2}.md`.
Cómo probarlo: igual que la Fase 13; Inicio, Tabla, Calendario, Perfil y la Sala (partido ACTIVE) con `participant03`; ruleta con un usuario sin club en un torneo en inscripción (`setup_demo.py 4 --yes`).
Siguiente paso: lo de la Fase 13; si algún escudo desentona, ajustar `CLUB_COLORS`.
