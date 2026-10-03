# Defensa – Pizarra táctica (Skia + Gesture Handler + Reanimated)

## Qué hace y flujo de datos
1. Perfil -> "Pizarra táctica" abre `mobile/app/tactics.tsx`. Pide `GET /me/squad` (`useMySquad`) y `GET /lineups/me` (`features/tactics/hooks.ts`). Un 404 `LINEUP_NOT_FOUND` significa "aún no guardaste": se convierte en `null`, no en error.
2. `buildSlots` (`features/tactics/lineup.ts`) reparte 11 jugadores de la plantilla en los huecos de la formación (`formations.ts`, datos): el mejor valorado de cada rol, y los guardados con sus posiciones. Sin 11 del rol, rellena con el mejor libre.
3. `Pitch.tsx` dibuja el campo una sola vez en un `Canvas` de Skia. Encima, 11 `PlayerToken.tsx` (vistas animadas).
4. Arrastre: `Gesture.Pan` (tras 120 ms de pulsación) escribe en `SharedValue`s x/y **normalizados** en el hilo de UI. `dragTo` (`geometry.ts`) suma la traslación del dedo a la posición inicial y aplica `clampToField`: el centro nunca se acerca a un borde a menos de un radio (+ hueco para el nombre).
5. Al soltar, `scheduleOnRN` avisa a React una sola vez (`onMoved`); ahí se actualiza el estado y se calcula si hay cambios (`signature`).
6. "Guardar alineación" -> `PUT /lineups/me` con `{formation, positions:[{playerId,x,y}]}`. El servidor valida (máx. 11, sin repetidos, jugadores del propio club). Solo online.
7. Cambiar de formación recoloca a los mismos jugadores en los nuevos huecos (se pierden posiciones personalizadas, a propósito).

## Decisiones
- **Coordenadas normalizadas 0..1** en vez de píxeles: la alineación guardada vale en cualquier teléfono y orientación. Coste: hay que convertir (`toPixels`/`toNormalized`) y el clamp con radio fijo en px se vuelve un margen normalizado que depende del tamaño del campo.
- **Fichas como vistas animadas sobre un Skia estático**, no dibujadas en Skia: texto, dorsal y gestos son más simples y fiables con vistas; Skia solo hace lo que hace bien (líneas y franjas). Alternativa descartada: todo en un Canvas con fuentes de Skia y un solo gesto con hit-testing manual (más control, bastante más código). Coste: 11 vistas animadas en vez de 1 canvas.
- **Posición en hilo de UI, estado de React solo al soltar**: sin `setState` por fotograma. Alternativa descartada: guardar x/y en `useState` y re-renderizar al mover (JS en el camino crítico del arrastre).

## Preguntas probables
1. *¿Por qué normalizado?* Porque el tamaño del campo cambia con el teléfono; 0..1 es independiente y el backend lo valida con `ge=0, le=1`.
2. *¿Qué corre en cada hilo?* Gesto, `dragTo` y estilo animado en el hilo de UI (funciones marcadas `'worklet'`); estado, red y guardado en JS.
3. *¿Cómo evitas que la ficha salga del campo?* `clampToField`: el centro se limita a `[r/ancho, 1-r/ancho]` (y análogo en y, con hueco inferior para el nombre). Test: cualquier entrada, hasta ±1e9, cae en [0,1].
4. *¿Qué pasa si guardas sin red?* El botón se deshabilita ("Sin conexión"); la alineación no entra en la cola offline (la cola es solo de eventos de partido).
5. *Difícil: ¿cómo sabes que va a 60 FPS?* Todavía no lo sé: el medidor existe (`FpsMeter.tsx`) pero la medición en el teléfono está PENDIENTE (`docs/performance/tactical-board.md`). Lo que sí puedo defender es el diseño (sin `setState` por fotograma, campo estático) y que el modo desarrollo de Expo Go rinde menos que una build de producción.

## Errores típicos
- 404 `LINEUP_NOT_FOUND` al cargar: es el estado "vacío", se muestra la formación por defecto.
- 422 `INVALID_LINEUP` / `PLAYER_NOT_IN_CLUB`: el mensaje del servidor se muestra bajo el campo.
- Plantilla con menos de 11 jugadores: aviso y alineación incompleta (el servidor admite hasta 11).
- Jugador guardado que ya no está en la plantilla: se ignora y se rellena el hueco.
- Campo sin medir (0 px): los helpers devuelven 0 en vez de NaN.
