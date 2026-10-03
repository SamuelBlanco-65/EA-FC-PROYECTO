# Defensa – Fase 0: entorno, arquitectura y `/health`

## Qué hace y flujo
1. `backend/app/main.py` crea la app FastAPI y monta el router de `backend/app/api/health.py`.
2. `GET /health` devuelve `{"status":"ok"}` sin tocar la base de datos: sirve para saber si el proceso vive.
3. `backend/tests/test_health.py` lo prueba con `TestClient` (sin red). `pytest.ini` fija `pythonpath = .` para importar `app`.
4. `mobile/` es una app Expo Router (`app/_layout.tsx`, `app/index.tsx`) que solo conocerá `EXPO_PUBLIC_API_URL` (`mobile/.env.example`). No tiene claves de Supabase ni importa `@supabase/supabase-js`.
5. Esquema: App → HTTPS/WSS → FastAPI → Supabase. El frontend nunca habla con la BD.

## Decisiones
- **Capas** router → service → domain → repository (carpetas ya creadas en `backend/app/`). Por qué: el dominio (calendario, tabla, estados) son funciones puras y se prueban sin red. Descartado: lógica en los routers (mezcla HTTP con reglas y no se puede probar aislada). Coste: más archivos.
- **Secretos solo en `backend/.env`**, ignorado por git (`.gitignore`). Por qué: lo que va en la app se puede extraer del APK. Coste: toda operación pasa por el backend.
- **Python 3.12 en el venv** en vez de 3.14. Por qué: ruedas precompiladas de dependencias nativas. Descartado: 3.14 (riesgo de compilar en Windows). Coste: no usa la última versión.

## Preguntas probables
1. *¿Por qué el frontend no habla con Supabase?* Regla del profesor y seguridad: las claves quedarían en el dispositivo; el backend valida el JWT y decide permisos y destinatarios.
2. *¿Para qué sirve `/health`?* Comprobar que el servicio responde (balanceadores, despliegue, mis pruebas). No consulta la BD a propósito; un `/ready` podría hacerlo.
3. *¿Por qué `TestClient` y no levantar el servidor?* Es rápido y determinista; además lo verifiqué una vez con uvicorn real.
4. *¿Cómo evitas subir secretos?* `.env` en `.gitignore`, solo `.env.example` con placeholders; revisé que no entrara en el commit.
5. Difícil: *Si la app no tiene claves, ¿cómo recibe datos en tiempo real?* Supabase Realtime lo escucha el backend con su clave secreta; el backend decide a quién avisar y lo envía por su propio WebSocket (`/ws`). El WS solo notifica; el estado se vuelve a pedir por REST (la BD es la fuente de verdad).

## Errores típicos
- `ModuleNotFoundError: app` al correr pytest → ejecutar desde `backend/` con el venv activo (o falta `pythonpath = .`).
- Expo Go no abre el proyecto → versión de SDK distinta a la de Expo Go (ver `docs/VERSIONES.md`).
- El teléfono no alcanza el backend → usar la IP de la PC (no `localhost`) en `EXPO_PUBLIC_API_URL`.
