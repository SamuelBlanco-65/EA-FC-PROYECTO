---
name: backend-fastapi
description: Convenciones del backend Python/FastAPI del proyecto EA FC. Usar siempre que se cree o modifique código en backend/ (routers, servicios, repositorios, WebSocket, listener realtime, tests).
---

# Backend FastAPI – convenciones

## Capas (no mezclar)
- `app/api/` routers: solo parsean entrada (Pydantic), llaman a un service y devuelven DTO. Sin lógica de negocio ni acceso a Supabase.
- `app/services/` reglas de negocio y autorización (¿participa en el partido?, ¿es su equipo?, ¿fecha activa?).
- `app/domain/` funciones PURAS sin I/O: round robin, tabla de posiciones, máquina de estados, cálculo de marcador. Son las más testeadas.
- `app/repositories/` único lugar que habla con Supabase.
- `app/realtime/` listener de Supabase Realtime + gestor de conexiones WebSocket.
- `app/core/` config (pydantic-settings o equivalente VERIFICADO), seguridad, errores, logging.
- `app/schemas/` modelos Pydantic de entrada/salida (DTO). La app nunca recibe filas crudas de Supabase.

## Autenticación
- Dependencia `get_current_user` valida el JWT de Supabase. Usa el método que indique la documentación ACTUAL de Supabase (validación por JWKS / claves de firma, o consulta a Auth). VERIFICAR antes de implementar y documentar en docs/VERSIONES.md.
- Dependencia `require_admin` lee el rol desde `profiles`, nunca desde el cliente.
- Dos clientes Supabase: uno por request con el JWT del usuario (RLS aplica) y uno con clave secreta (solo admin, asignación atómica, listener). Documentar en cada repositorio cuál usa y por qué.

## WebSocket
- Ruta `/ws`. El primer mensaje debe ser `{"type":"AUTH","token":"..."}` (no tokens en la URL: quedan en logs). Si no llega en 5 s o es inválido, cerrar.
- `ConnectionManager`: dict user_id -> conjunto de sockets. Soporta varias conexiones por usuario.
- El listener realtime recibe cambios de `matches` y `match_events`, busca los participantes del partido y envía solo a esos user_id. Eventos globales (ROUND_ACTIVATED, STANDINGS_UPDATED) a todos.
- Mensajes tipados con Pydantic (campo `type` como Literal). Lista de tipos en `app/realtime/events.py`, espejada en `mobile/src/realtime/events.ts`.
- El listener debe reconectarse si Supabase Realtime cae y registrar el estado en logs.

## Imágenes
- `GET /media/crests/{club_id}` y `GET /media/players/{player_id}`: el backend lee el archivo del bucket privado con la clave secreta y lo devuelve con `Cache-Control` largo y `ETag`. Requiere usuario autenticado o, si complica la caché de imágenes en la app, documentar por qué se dejan públicas solo estas dos rutas.
- Los DTO devuelven `crestUrl` / `photoUrl` apuntando a estas rutas del backend, nunca a Supabase ni a la web de origen.

## Errores
- Excepción base `AppError(code, message, status, details)` + handler global -> `{"error": {...}}`.
- Supabase caído -> 503 `UPSTREAM_UNAVAILABLE`. Nunca devolver trazas.

## Logs
- Permitido: request id, user id, match id, tipo de evento, tiempos, código de error. Prohibido: contraseñas, tokens, claves.

## Tests (pytest)
- `tests/domain/` sin red. `tests/integration/` contra el proyecto Supabase de desarrollo, marcados para poder saltarlos.
- Ejecutar con `python -m pytest` desde `backend/` con el venv activo.
