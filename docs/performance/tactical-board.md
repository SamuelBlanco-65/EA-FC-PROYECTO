# Rendimiento de la pizarra táctica

Estado: **MEDIDO POR EL USUARIO, resultado resumido.** El usuario ejecutó la medición en su teléfono y reportó **60 FPS estables**. No facilitó las cifras exactas del chip ni el modelo, así que esos campos dicen "no reportado": no se inventan.

## Qué se mide

Arrastrar fichas de la pizarra durante 30 s seguidos (de una a otra zona del campo, soltando y volviendo a coger), sin otras pantallas en segundo plano.

| Campo | Valor |
|---|---|
| Dispositivo | Android 14 físico (modelo y tasa de refresco: no reportados) |
| Entorno | Expo Go, bundle de **desarrollo** (`npx expo start`). Rinde menos que una build de producción: Hermes sin optimizar para release, validaciones de React y logs activos. |
| Escenario | Pizarra 4-3-3 con 11 fichas; arrastre continuo de fichas durante 30 s |
| Herramienta | Medidor propio de la pantalla (`src/features/tactics/FpsMeter.tsx`), ver abajo. Contraste opcional: monitor de rendimiento del menú de desarrollo de React Native (VERIFICAR nombre exacto en Expo Go; en el menú de desarrollo aparece como "Perf Monitor"/"Show Performance Monitor"). |

## Cómo funciona el medidor (para poder defender la cifra)

- **FPS de UI**: `useFrameCallback` de Reanimated se ejecuta en el hilo de UI en cada fotograma y recibe `timeSincePreviousFrame`. FPS = fotogramas / tiempo acumulado (`frameStats.ts`, con tests). Es el hilo que mueve las fichas.
- **FPS de JS**: bucle de `requestAnimationFrame` en el hilo JS. Si el arrastre no depende de JS, este número debe seguir alto aunque se mueva una ficha (no hay `setState` por fotograma).
- **Fotogramas lentos**: los que tardan más de 25 ms (se saltan al menos un refresco de 60 Hz). **Peor fotograma** en ms. **Mínimo**: la peor ventana de 1 s.
- Coste propio: un callback por fotograma y un `setState` por segundo. Es pequeño pero no cero.
- Limitación: mide fotogramas que el hilo de UI procesa, no lo que la GPU llega a mostrar. No sustituye a una captura de GPU (Perfetto), que no se ha hecho.

## Cómo repetirla (PowerShell)

```powershell
cd mobile
npx expo start --clear
```

1. Abrir en Expo Go (Android) -> Perfil -> "Pizarra táctica".
2. Tocar el chip de arriba a la derecha del campo ("Toca para medir 30 s").
3. Durante 30 s: mantener pulsada una ficha, arrastrarla por todo el campo, soltarla, coger otra.
4. El chip muestra al terminar: duración, FPS medio, mínimo de 1 s, fotogramas lentos, peor fotograma y FPS de JS. La misma línea sale en la terminal de Metro con el prefijo `[tactics-fps]`.

## Resultado (rellenar con lo que muestre el teléfono)

| Medida | Valor |
|---|---|
| Duración real | 30 s (según el procedimiento; no reportada) |
| FPS UI medio | 60 (reportado: "60 FPS estables") |
| FPS UI mínimo (ventana de 1 s) | no reportado |
| Fotogramas > 25 ms | no reportado |
| Peor fotograma | no reportado |
| FPS JS medio | no reportado |
| ¿Llega a 60? | Sí, según el usuario, en Expo Go (modo desarrollo) |

Como sí llega a 60, las causas siguientes no aplican; se conservan por si aparece una caída en otro dispositivo (hipótesis, NO medidas):
1. Modo desarrollo en Expo Go (lo más probable): repetir con `npx expo start --no-dev --minify`.
2. Sombras/`elevation` o `zIndex` animado en Android al levantar la ficha activa.
3. 11 vistas con su propio `GestureDetector` y estilo animado: 11 callbacks por fotograma en el hilo de UI aunque solo se mueva una (se podría reducir moviendo una única ficha activa).
4. Pantalla de 90/120 Hz: contra un objetivo de 60 Hz "medio 60" es correcto; con 120 Hz el medio puede mostrar 90-120.

## Por qué debería ir fluido (argumento de diseño, NO resultado)

- Posición de cada ficha en `SharedValue`s actualizados por el gesto en el hilo de UI; React solo se entera al soltar (`onMoved`).
- El campo es un `Canvas` de Skia **estático**: no se redibuja mientras se arrastra, las fichas son vistas aparte encima.
- Cálculos de arrastre (`dragTo`, `clampToField`) son O(1) por fotograma.
