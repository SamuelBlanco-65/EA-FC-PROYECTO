# Versiones y fuentes (Fase 0 – 2026-10-02)

Leyenda: VERIFICADO = comprobado ejecutando o leyendo el archivo instalado. NO PROBADO = documentado pero no ejecutado. VERIFICAR = dato dudoso o no confirmado en la fuente.

## Herramientas locales (VERIFICADO con `--version`)

| Herramienta | Versión | Nota |
|---|---|---|
| Node.js | 20.20.2 | Versión LTS vieja; Expo SDK 57 y las herramientas corrieron sin errores |
| npm | 10.8.2 | |
| Git | 2.52.0.windows.1 | |
| Python del sistema | 3.14.0 | NO usado para el venv |
| Python del venv (`backend/venv`) | 3.12.0 | Elegido porque algunas dependencias nativas (cffi, cryptography, multidict, yarl) publican ruedas antes para 3.12 que para 3.14; con 3.14 podría exigir compilar en Windows. Decisión mía, no pedida: el usuario puede cambiarla |

## Backend (`backend/requirements.txt`, congelado con `pip freeze`)

| Paquete | Versión | Fuente consultada |
|---|---|---|
| fastapi | 0.142.2 | PyPI + documentación oficial de FastAPI |
| uvicorn | 0.54.0 | PyPI |
| starlette | 1.7.0 | dependencia de FastAPI |
| pydantic / pydantic-core | 2.13.5 / 2.46.5 | PyPI |
| pydantic-settings | 2.15.0 | PyPI (configuración desde `.env`) |
| supabase (supabase-py) | 2.32.0 | PyPI + documentación de Supabase Python |
| realtime (incluido en supabase) | 2.32.0 | PyPI + documentación del cliente Python |
| postgrest / storage3 / supabase-auth / supabase-functions | 2.32.0 | dependencias de supabase |
| PyJWT + cryptography | 2.15.1 / 50.0.2 | Candidatos para validar el JWT por JWKS (ES256/RS256). Instaladas como dependencias; el uso real queda para la fase de auth |
| pytest | 9.1.1 | PyPI |
| httpx | 0.28.1 | requerido por `TestClient` de FastAPI |
| websockets | 15.0.1 | dependencia de realtime |

Resultado (VERIFICADO): `python -m pytest` → 1 passed; uvicorn real responde `GET /health` → 200 `{"status":"ok"}`.

Advertencia (VERIFICADO al ejecutar, sin impacto): aviso de deprecación relacionado con `httpx` ("httpx2") durante los tests. No se actuó; revisar si crece.

## Mobile (`mobile/package.json`)

| Paquete | Versión | Fuente consultada |
|---|---|---|
| expo (SDK 57) | ~57.0.26 | Changelog y documentación de Expo; SDK 57 estable desde 2026-06-30 |
| react-native | 0.86.3 | tabla del SDK 57 |
| react / react-dom | 19.2.3 | `npx expo install react-dom`; expo-router 57 lo exige como peer incluso sin web |
| expo-router | ~57.0.24 | documentación de Expo Router |
| @shopify/react-native-skia | 2.6.2 | docs de Expo (lista "Included in Expo Go") |
| react-native-reanimated | 4.5.1 | docs de Expo |
| react-native-worklets | 0.10.1 | requerido por Reanimated 4 |
| react-native-gesture-handler | ~2.32.0 | docs de Expo |
| expo-screen-orientation | ~57.0.2 | docs de Expo |
| expo-secure-store | ~57.0.4 | docs de Expo |
| expo-crypto | ~57.0.3 | Fase 9: `randomUUID()` para el id de cada evento (módulo nativo del SDK 57, `bundledNativeModules.json`; instalado con `expo install`) |
| @tanstack/react-query | ^5.104.1 | documentación de TanStack |
| zustand | ^5.0.15 | documentación de Zustand |
| typescript | ~6.0.3 | plantilla de Expo |

Resultado (VERIFICADO): `npx tsc --noEmit` sin errores; `npx expo-doctor` 21/21; `npx expo install --check` sin cambios; Metro sirve el bundle Android por HTTP 200 (1401 módulos).

Dependencias que NO se instalaron aún (no hay código que las use): `expo-font`, `@expo/vector-icons`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `expo-linear-gradient`. Se añadirán con `npx expo install` cuando haga falta.

## ¿Corren en Expo Go? (pregunta de la Fase 0)

- Según la documentación de Expo, TODAS las librerías móviles del proyecto figuran como "Included in Expo Go": Skia, Reanimated 4 (con worklets), Gesture Handler, expo-screen-orientation, expo-secure-store, AsyncStorage y expo-sqlite. **No hay librería obligatoria fuera de Expo Go, por eso no me detuve.**
- Estado real: NO PROBADO en el teléfono. Solo se verificó que el bundle compila. Se comprobará abriendo la app con Expo Go en el Android 14.
- MMKV NO está en Expo Go (por eso no se propone).

### Riesgo con fecha de entrega (importante)

Expo Go solo soporta el SDK más reciente. SDK 58 está en beta desde 2026-09-15 y saldrá estable en unas 3–4 semanas; cuando salga, las tiendas dejarán de ofrecer una versión de Expo Go para SDK 57. La entrega es el 2026-10-06, pero el teléfono puede actualizar Expo Go antes. Mitigaciones: no actualizar Expo Go en el teléfono, o instalar la versión SDK 57 desde expo.dev/go o con `npx expo-go download android latest` (VERIFICAR el nombre exacto y la versión que descarga ese comando). Alternativa si hiciera falta migrar: `npx expo install expo@latest --fix`. Decisión pendiente del usuario.

## Almacenamiento local para la cola offline (DECIDIDO en la Fase 9: AsyncStorage)

Decisión Fase 9: la cola usa **AsyncStorage** (ya instalado para la caché de consultas), con un único JSON `{v, pending, rejected}` y escrituras encadenadas. Motivo: la cola es pequeña (decenas de eventos), no hace falta SQL y se evita otra dependencia. Alternativa descartada: expo-sqlite (la propuesta original abajo). Coste: cada cambio reescribe el JSON entero (irrelevante a este tamaño) y no hay transacciones (se compensa con `id` idempotente en el servidor).

Propuesta original (descartada): **expo-sqlite** para la cola de eventos. Motivo: orden garantizado, transacciones y estado por fila (pendiente / enviado / error), y sirve también como almacén clave-valor para la caché persistida de TanStack Query. Alternativa: `@react-native-async-storage/async-storage` (más simple, pero cada cambio reescribe un JSON y no hay transacciones). Descartado: MMKV (no está en Expo Go). La API concreta de persistencia de TanStack Query con SQLite es VERIFICAR antes de usarla.

## Supabase: claves y validación del JWT

- Claves nuevas `sb_publishable_...` y `sb_secret_...`: se envían en el encabezado `apikey` (no como Bearer). Las legacy `anon` / `service_role` quedarán deprecadas a finales de 2026. Fuente: documentación de Supabase (API keys). Que supabase-py 2.32.0 acepte las claves `sb_` sin cambios es VERIFICAR.
- Validación del JWT hoy: claves de firma asimétricas publicadas en `https://<proyecto>.supabase.co/auth/v1/.well-known/jwks.json` (ES256 o RS256); se verifica la firma con la clave pública, y se comprueban `exp`, `iss` y `aud`. El método `get_claims` del cliente Python existe según la documentación, pero la forma exacta de su retorno y su comportamiento con HS256 son VERIFICAR. HS256 con secreto compartido está desaconsejado. Fuente: página de signing keys de Supabase + búsqueda. La página específica de validación de JWT NO se pudo descargar (error de conexión). La decisión final (JWKS con PyJWT o consulta a Auth) se toma en la fase de autenticación y se vuelve a verificar.
- Cliente realtime de Python (`realtime` 2.32.0) – VERIFICADO en la Fase 6 leyendo el código instalado y ejecutándolo contra Supabase real:
  - `AsyncRealtimeClient(f"{SUPABASE_URL}/realtime/v1", token=<clave secreta sb_secret_...>, auto_reconnect=False)`; `client.channel(nombre)`, `channel.on_postgres_changes(RealtimePostgresChangesListenEvent.All, callback, table=..., schema="public")`, `await channel.subscribe(callback_estado)` con `RealtimeSubscribeStates.SUBSCRIBED/CHANNEL_ERROR/TIMED_OUT/CLOSED`.
  - Los callbacks son SÍNCRONOS y se ejecutan en la tarea de lectura de la librería: el listener solo encola (`put_nowait`) y procesa en otra tarea.
  - La clave `sb_secret_...` se acepta como token del websocket y entrega TODAS las filas pese a la RLS (probado en `tests/integration/test_realtime_real.py`). Las tablas ya estaban publicadas (migración 0007).
  - `payload["data"]` trae `table`, `type` (INSERT/UPDATE/DELETE) y `record` (fila nueva completa; `old_record` solo trae la clave primaria con la identidad de réplica por defecto, por eso el traductor usa solo el estado NUEVO).
  - Límite de la librería: solo reconecta tras `ConnectionClosedError` (por eso el supervisor propio de `app/realtime/listener.py`). La URL de conexión lleva la clave como `?apikey=` y se registra en DEBUG: los loggers `realtime` y `websockets` se fijan en WARNING.
  - Atributo privado usado: `client._ws_connection.state` (protegido con `getattr`); si una versión futura lo quita, solo se pierde esa comprobación.
- `/ws` (Starlette `WebSocket`, uvicorn 0.54 con `websockets` 15.0.1): VERIFICADO con uvicorn real y clientes `websockets.asyncio.client.connect`.

## Otros pendientes detectados

- Skill `sistema-diseno` no existe en `.claude/skills/` (CLAUDE.md la menciona). Los tokens quedan en `docs/design/design-system.md`.
- `npm audit` reporta hallazgos en dependencias transitivas de la plantilla; no se ejecutó `npm audit fix` (podría romper versiones fijadas por Expo).
- `mobile/app.json` tiene `orientation: "portrait"`; la sala en vivo necesita landscape. Fase 9: la sala usa `lockAsync(OrientationLock.LANDSCAPE)` y vuelve con `PORTRAIT_UP` (nombres confirmados en la doc de Expo). La doc NO aclara si `orientation: "portrait"` del `app.json` impide el bloqueo en tiempo de ejecución en Expo Go: NO PROBADO hasta abrir la sala en el teléfono. Plan B si no gira: poner `"orientation": "default"` en `app.json` y bloquear portrait en el layout raíz.
- El QR de `npx expo start` no se pudo imprimir en un terminal sin TTY: se verificó el manifiesto y el bundle por HTTP. Ver el QR y escanearlo lo hace el usuario.

## Fase 1 – Base de datos (2026-10-03)

| Paquete / servicio | Versión | Nota |
|---|---|---|
| psycopg + psycopg-binary | 3.3.6 | Driver de Postgres para `scripts/db/*` (migraciones y pruebas). Añadido a `requirements.txt` junto con `tzdata` 2026.4. Elegido en vez de `psycopg2` por ser la versión actual (3.x) con ruedas para Windows |
| PostgreSQL de Supabase | 17.11 | VERIFICADO con `select version()` |

Cerrado en esta fase (antes era VERIFICAR):
- VERIFICADO: supabase-py 2.32.0 funciona con las claves nuevas `sb_publishable_...` / `sb_secret_...` (login de usuarios, lecturas con JWT, escrituras y `rpc` con la clave secreta en `scripts/db/test_rls.py`).
- VERIFICADO: la publicación `supabase_realtime` existe y ya contiene `matches` y `match_events` (`pg_publication_tables`). Se añadieron con `ALTER PUBLICATION ... ADD TABLE` (SQL estándar de Postgres; NO consulté la página de Supabase en esta fase). La ENTREGA de eventos al listener sigue NO PROBADA (fase de realtime).
- Conexión: la `DATABASE_URL` usa la Session pooler (puerto 5432); la conexión directa es solo IPv6.

## Fase 2 – Autenticación (2026-10-03)

| Paquete | Versión | Nota |
|---|---|---|
| PyJWT (`PyJWKClient`) | 2.15.1 | Validación local del JWT con la clave pública del proyecto |
| pydantic-settings | 2.15.0 | Configuración desde `backend/.env` |
| supabase (supabase-py) | 2.32.0 | Auth (`sign_up`, `sign_in_with_password`, `refresh_session`) y PostgREST con el JWT del usuario |

Cerrado en esta fase (antes era VERIFICAR):
- Método de validación del JWT elegido: JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`) con `PyJWKClient`, caché de 300 s. Solo se aceptan `ES256` y `RS256` (HS256 y `none` se rechazan: evita el ataque de confusión de algoritmo). Se exigen `exp`, `sub`, `aud="authenticated"`, `iss="{SUPABASE_URL}/auth/v1"` y `role="authenticated"`; margen de reloj 10 s. VERIFICADO con tokens reales del proyecto (ES256) y con tokens falsificados en `backend/tests/`. Descartado: `auth.get_claims()` / consultar a Auth en cada request (otra ida y vuelta de red por request; su comportamiento exacto no se comprobó).
- El rol sale de `profiles` (leído con el JWT del propio usuario, RLS `profiles_select_own`), nunca del token ni del cliente. VERIFICADO: el mismo token pasa de 403 a 200 al promover al usuario en la BD.
- supabase-py reescribe el encabezado `Authorization` de su cliente al iniciar sesión (evento SIGNED_IN), por eso se crea un cliente NUEVO por operación de Auth. Observado en el código fuente de la librería.
- Supabase responde `validation_failed` (400) a un refresh token inválido; se traduce según la operación.

Pendiente / NO PROBADO:
- Caso EMAIL_CONFIRMATION_REQUIRED (proyecto con "Confirm email" ON): solo probado con repositorio simulado.

Cerrado después: `POST /auth/register` VERIFICADO contra el proyecto real con "Confirm email" OFF (con ON, Supabase devolvía 429 `over_email_send_rate_limit` por el SMTP integrado). Con el proveedor Email desactivado, Supabase responde `email_provider_disabled` (400/422) y rompe también el login.


## Fase 8 – paquetes móviles añadidos (2026-10-03)

Instalados con `npx expo install` (versiones que fija el SDK 57). Todos figuran como "Included in Expo Go" según la documentación de Expo (NO PROBADO en el teléfono hasta que el usuario lo abra).

| Paquete | Versión | Uso |
|---|---|---|
| expo-image | ~57.0.5 | `ClubCrest` / `PlayerAvatar`: caché en disco (`cachePolicy="disk"`, `cacheKey`, `headers`) |
| expo-font, @expo-google-fonts/barlow, @expo-google-fonts/barlow-condensed | ~57.0.4 / ^0.4.1 | Tipografía candidata del sistema de diseño |
| expo-linear-gradient | ~57.0.2 | Botón primario, logo |
| @expo/vector-icons | ^15.0.2 | Iconos Feather |
| @react-native-async-storage/async-storage | 2.2.0 | Almacén de la caché de TanStack Query |
| @react-native-community/netinfo | 12.0.1 | Estado de red -> `onlineManager` y banner |
| @tanstack/react-query-persist-client, @tanstack/query-async-storage-persister | ^5.104.1 | Caché persistida |

Verificado: `npx tsc --noEmit` sin errores; `npx expo export --platform android` empaqueta (Hermes, 5,1 MB); `npx expo install --check` sin cambios. `expo-doctor`: 20/21, el que falla es la consulta de red al directorio de React Native ("unexpected server response"), no el proyecto.
