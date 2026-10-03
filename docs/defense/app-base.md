# Defensa: app base (Fase 8) – sesión, caché offline, ruleta, tiempo real, imágenes

## Qué hace y flujo
1. **Arranque** (`mobile/app/_layout.tsx`): carga fuentes, restaura la sesión de SecureStore (`stores/sessionStore.ts`, solo local, sin red) y monta la caché persistida de TanStack Query (`api/queryClient.ts`, AsyncStorage). `app/index.tsx` es la puerta: sin sesión -> login; con sesión -> `GET /participants/me`: 200 -> Home, 403 `NOT_A_PARTICIPANT` -> ruleta.
2. **Login/registro** (`app/(auth)/`): `POST /auth/login|register` -> `{accessToken, refreshToken, user}` -> `setSession` guarda los tres en SecureStore. El layout `(auth)` redirige solo al cambiar el estado.
3. **Cliente API** (`api/client.ts`): añade el `Bearer`; ante un 401 hace UN `POST /auth/refresh` (compartido entre peticiones simultáneas) y reintenta UNA vez. Errores normalizados `{code,message,status}`; sin red -> `NETWORK_ERROR`.
4. **Ruleta** (`app/roulette.tsx`): "Girar" -> `POST /participants/me/assign-club`. El SERVIDOR elige el club; la rueda (Skia + Reanimated) gira en bucle mientras espera y luego frena sobre el sector de ese club. Si `alreadyAssigned` salta a Home sin animar.
5. **Home/Tabla/Calendario**: `GET /tournament`, `/tournament/standings`, `/tournament/fixtures`; "mi" fila/partido se identifica con mi `participant.id`. Funciones puras en `features/tournament/derive.ts`.
6. **Tiempo real** (`realtime/RealtimeService.ts`): un único WebSocket a `wss://.../ws`, AUTH como primer mensaje, PING cada 25 s, backoff exponencial con jitter (1-30 s). Cada aviso invalida consultas (`realtime/invalidation.ts`); tras reconectar se invalida todo. `ConnectionBanner` muestra sin conexión / conectando.
7. **Imágenes** (`components/ClubCrest.tsx`): `expo-image` pide `/media/...` con el token, las guarda en disco con `cacheKey` = URL sin token; si faltan o fallan, iniciales.

## Decisiones
1. **Caché persistida de TanStack Query en vez de copiar datos a Zustand.** El servidor es la verdad; la caché se hidrata del disco y se refresca sola al volver la red. Descartado: guardar tablas en un store propio (dos fuentes de verdad). Coste: hay que subir `CACHE_BUSTER` si cambia la forma de una respuesta.
2. **`GET /participants/me` de solo lectura** (backend). `assign-club` inscribe, así que no sirve para "¿ya tengo club?". Descartado: llamar a `assign-club` al abrir. Coste: un endpoint más (probado contra Supabase real: no inscribe).
3. **`/media` exige JWT y se sirve desde el backend** con la clave secreta (bucket privado). La imagen se cachea por URL, no por token, así un token renovado sigue acertando la caché y funciona sin conexión. Descartado: rutas públicas. Coste: cada imagen pide validar JWT + 2 lecturas la primera vez.

## Preguntas probables
1. *¿La app habla con Supabase?* No: no hay `supabase-js` ni claves; solo `EXPO_PUBLIC_API_URL`.
2. *¿Qué pasa si el access token caduca?* El cliente recibe 401, renueva con el refresh token (una sola vez aunque fallen varias peticiones) y reintenta. Si el refresh token está muerto, cierra la sesión; si solo falla la red, la mantiene.
3. *¿Cómo ves la tabla en modo avión?* La caché de consultas se guardó en disco; al abrir sin red se hidrata y las consultas quedan en pausa (`fetchStatus: paused`). Hay que haberla visto antes con conexión.
4. *¿Quién decide el club de la ruleta?* La función SQL atómica del servidor; la rueda solo anima hacia el sector recibido.
5. *Difícil: ¿y si el WebSocket pierde un mensaje?* No importa: el WS solo notifica; al reconectar se invalida todo y se vuelve a pedir por REST. Cuenta además el PING/PONG que detecta un enlace muerto.

## Errores típicos
- `TOURNAMENT_NOT_FOUND` en la ruleta: no hay torneo creado (aún no hay endpoint; se crea por SQL).
- `TOURNAMENT_NOT_DRAFT`: inscripción cerrada.
- Primera petición tras dormir Render: hasta ~1 min (el cliente espera 60 s).
- Imagen sin escudo: iniciales sobre fondo discontinuo.
