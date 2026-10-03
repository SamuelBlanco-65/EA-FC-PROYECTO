---
name: mobile-expo
description: Convenciones de la app React Native/Expo del proyecto EA FC: estructura, estado, cliente API, WebSocket, cola offline, sala horizontal y pizarra táctica con Skia. Usar al crear o modificar código en mobile/.
---

# Mobile Expo – convenciones

## Reglas duras
- Debe correr en Expo Go (Android 14). Instalar con `npx expo install <paquete>`. Si algo no está en Expo Go, DETENTE y avisa.
- Prohibido `@supabase/supabase-js` o cualquier clave. Solo `EXPO_PUBLIC_API_URL`.
- Nada de lógica de negocio en componentes: reglas en el backend; la app solo refleja lo que el servidor permite.

## Estructura
- `app/` rutas Expo Router: `(auth)/login`, `(auth)/register`, `roulette`, `(tabs)/home|standings|fixtures|squad|profile`, `match/[id]` (horizontal), `tactics`, `admin/*`.
- `src/api/client.ts` fetch con token, refresh automático en 401, errores normalizados `{code,message}`.
- `src/features/<feature>/` hooks de TanStack Query + componentes.
- `src/stores/` Zustand: sesión, estado de conexión (online/ws), UI. No copiar datos del servidor aquí.
- `src/realtime/RealtimeService.ts`: un único WebSocket; estados connecting/connected/authenticated/reconnecting/disconnected; backoff exponencial con tope; al reconectar invalida queries afectadas. Las pantallas lo usan vía hooks, nunca abren sockets.
- `src/offline/eventQueue.ts`: cola persistente de eventos (almacenamiento local compatible con Expo Go, VERIFICAR), envío en orden, reintento, idempotente por UUID.
- `src/theme/` tokens (ver skill sistema-diseno).

## Sala de partido
- Al entrar: bloquear landscape con expo-screen-orientation; al salir: volver a portrait.
- Mostrar claramente TU EQUIPO vs OPONENTE; solo tu lado tiene botones Gol / Amarilla / Roja (eligiendo jugador y minuto).
- Indicador de conexión y de eventos pendientes en cola.
- Local: botón Finalizar (deshabilitado offline o con cola pendiente). Visitante: modal Confirmar / Rechazar al recibir MATCH_RESULT_PENDING o al abrir un partido en ese estado.

## Pizarra táctica
- Campo dibujado en un Canvas de Skia; fichas = círculos + dorsal/iniciales.
- Arrastre con Gesture Handler (Pan) + shared values de Reanimated: la posición se actualiza en el hilo de UI, sin setState por frame.
- Coordenadas normalizadas 0..1; clamp considerando el radio de la ficha; conversión pantalla <-> normalizado en un helper puro y testeable.
- Formaciones (4-3-3, 4-4-2, 4-2-3-1, 3-5-2) como datos en `src/features/tactics/formations.ts`.
- Guardar con PUT /lineups/me al soltar o con botón Guardar (no en cada frame).
- FPS: medir con el monitor de rendimiento del menú de desarrollo de Expo/React Native (VERIFICAR nombre y ubicación) y documentar en docs/performance/tactical-board.md, aclarando que el modo desarrollo rinde menos que una build de producción.
