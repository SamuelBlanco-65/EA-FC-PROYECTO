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

## Almacenamiento local para la cola offline (propuesta, PENDIENTE de confirmar)

Propuesta: **expo-sqlite** para la cola de eventos. Motivo: orden garantizado, transacciones y estado por fila (pendiente / enviado / error), y sirve también como almacén clave-valor para la caché persistida de TanStack Query. Alternativa: `@react-native-async-storage/async-storage` (más simple, pero cada cambio reescribe un JSON y no hay transacciones). Descartado: MMKV (no está en Expo Go). La API concreta de persistencia de TanStack Query con SQLite es VERIFICAR antes de usarla.

## Supabase: claves y validación del JWT

- Claves nuevas `sb_publishable_...` y `sb_secret_...`: se envían en el encabezado `apikey` (no como Bearer). Las legacy `anon` / `service_role` quedarán deprecadas a finales de 2026. Fuente: documentación de Supabase (API keys). Que supabase-py 2.32.0 acepte las claves `sb_` sin cambios es VERIFICAR.
- Validación del JWT hoy: claves de firma asimétricas publicadas en `https://<proyecto>.supabase.co/auth/v1/.well-known/jwks.json` (ES256 o RS256); se verifica la firma con la clave pública, y se comprueban `exp`, `iss` y `aud`. El método `get_claims` del cliente Python existe según la documentación, pero la forma exacta de su retorno y su comportamiento con HS256 son VERIFICAR. HS256 con secreto compartido está desaconsejado. Fuente: página de signing keys de Supabase + búsqueda. La página específica de validación de JWT NO se pudo descargar (error de conexión). La decisión final (JWKS con PyJWT o consulta a Auth) se toma en la fase de autenticación y se vuelve a verificar.
- Cliente realtime de Python: API consultada `AsyncRealtimeClient`, `channel(...).on_postgres_changes(...)`, `subscribe`. NO VERIFICADO: requisitos de publicación (`supabase_realtime`) y de RLS para que `postgres_changes` entregue filas al listener con la clave secreta (la página no cargó). Se prueba en la fase de realtime.

## Otros pendientes detectados

- Skill `sistema-diseno` no existe en `.claude/skills/` (CLAUDE.md la menciona). Los tokens quedan en `docs/design/design-system.md`.
- `npm audit` reporta hallazgos en dependencias transitivas de la plantilla; no se ejecutó `npm audit fix` (podría romper versiones fijadas por Expo).
- `mobile/app.json` tiene `orientation: "portrait"`; la sala en vivo necesita landscape. VERIFICAR con `expo-screen-orientation` en la fase de la sala.
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
