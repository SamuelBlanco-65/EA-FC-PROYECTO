# Defensa – Fase 2: autenticación y autorización

## Qué hace y flujo (request autenticado)
1. La app envía `Authorization: Bearer <accessToken>`. El middleware de `backend/app/main.py` asigna un `X-Request-ID` y registra método, ruta, estado, ms y user id (nunca el token).
2. `api/deps.py::get_current_user` extrae el token con `HTTPBearer(auto_error=False)`; sin token -> 401 `NOT_AUTHENTICATED`.
3. `services/auth_service.py::authenticate` llama a `core/security.py::JwtVerifier`: obtiene la clave pública por JWKS (caché 300 s), verifica firma ES256/RS256, `exp`, `iss`, `aud` y `role`. El `user_id` sale del `sub` firmado.
4. `repositories/profile_repository.py` lee el rol de `profiles` con el JWT del propio usuario (RLS `profiles_select_own`). Sin fila -> 403 `PROFILE_NOT_FOUND`.
5. Se devuelve `CurrentUser`. `require_admin` exige `role == admin`, si no 403 `FORBIDDEN`. Luego corre el handler.
6. Cualquier `AppError` sale como `{"error":{"code","message","details"}}` (`core/errors.py`).

Login/registro/refresh: `api/auth.py` -> `AuthService` -> `AuthRepository` (Supabase Auth con la clave publishable). La app recibe `accessToken` y `refreshToken`; el backend nunca guarda sesión.

## Decisiones
- **Validar el JWT localmente por JWKS.** Por qué: sin llamada de red a Auth por request; la firma asimétrica no se puede falsificar sin la clave privada. Descartado: consultar a Auth en cada request. Coste: un token robado sigue valiendo hasta que expire (máx. 1 h por defecto de Supabase; VERIFICAR el ajuste del proyecto).
- **El rol se lee de `profiles`, no del token.** Por qué: el cliente controla `user_metadata`; la tabla solo la cambia el servidor (permiso por columna). Descartado: claim `role` en el JWT. Coste: una consulta extra por request (sin caché; se puede añadir).
- **Solo `ES256`/`RS256`.** Por qué: evita el ataque de confusión de algoritmo (HS256 firmado con la clave pública, o `alg: none`). Coste: ninguno relevante.

## Preguntas probables
1. *¿Cómo sabes que el token es auténtico?* Firma verificada con la clave pública del JWKS, más `exp`, `iss` y `aud`. `tests/api/test_auth_dependencies.py` prueba firma ajena, expirado, iss/aud erróneos, HS256 y `none`.
2. *¿Por qué 401 y por qué 403?* 401 = no sé quién eres (sin token o inválido). 403 = sé quién eres pero no tienes permiso (participante en ruta admin).
3. *¿Dónde se decide si alguien es admin?* En la tabla `profiles`, en `require_admin`. El cliente no puede cambiarlo: no hay campo `role` en el registro y la columna es inmutable para usuarios.
4. *¿Por qué el mismo error si el usuario no existe o la contraseña es mala?* Evita enumerar correos: ambos dan 401 `INVALID_CREDENTIALS` (probado contra Supabase real).
5. Difícil: *Si un admin es degradado, ¿cuándo pierde el acceso?* En el siguiente request, porque el rol se consulta en cada uno (probado: el mismo token pasa de 403 a 200 al promoverlo). El token en sí no se puede revocar antes de `exp`; el refresh se invalida cerrando la sesión en Supabase.

## Errores típicos
- 401 `TOKEN_EXPIRED` -> la app debe llamar a `/auth/refresh` y reintentar una vez.
- 503 `UPSTREAM_UNAVAILABLE` -> Supabase o el JWKS no responden (a propósito no es 401: el token no es culpable).
- 403 `EMAIL_CONFIRMATION_REQUIRED` en `/auth/register` -> el proyecto exige confirmar el correo (solo probado con repositorio simulado). 429 `RATE_LIMITED` -> límite de correos de Supabase; se evitó desactivando "Confirm email" (registro real VERIFICADO). 503 `AUTH_PROVIDER_DISABLED` -> el proveedor Email está apagado en Supabase.
- `ValidationError` al arrancar -> `backend/.env` con valores de ejemplo (`REPLACE_ME`).
