# Seguridad de la base de datos

Estado: VERIFICADO con `scripts/db/test_rls.py` (48/48, JWT reales de usuarios normales) y `test_schema.py`.
No probado todavía: validación del JWT por el backend (fase de auth) y entrega Realtime (fase de realtime).

## Cuatro capas, cada una con un trabajo distinto

| Capa | Qué responde | Dónde está |
|---|---|---|
| Autenticación (Supabase Auth) | ¿Quién eres? Emite el JWT (access/refresh token) | Supabase; la app solo recibe los tokens del backend |
| GRANTs de Postgres | ¿Qué operaciones puede *intentar* este rol en esta tabla? | `0006_rls.sql` (revoke all + grants mínimos) |
| RLS | ¿Sobre qué *filas* puede hacerlo? | Políticas en `0006_rls.sql` |
| Backend (FastAPI) | Reglas de negocio y permisos de admin; valida el JWT y lee el rol de `profiles` | `backend/` (fases siguientes) |

Idea para la defensa: RLS es la red de seguridad debajo del backend ("defensa en profundidad"), no su sustituto. El backend ya valida lo mismo; si tuviera un bug, la BD seguiría negando lo prohibido.

## Qué protege RLS (con JWT de usuario)

- `profiles`: cada usuario ve y edita solo el suyo. El `role` no se puede cambiar: no por política, sino porque solo existe `GRANT UPDATE (display_name)` (permiso por columna). Intentar `update role` devuelve 42501. Además el trigger de alta ignora cualquier `role` que venga en los metadatos del registro.
- `clubs`, `players`, `tournaments`, `tournament_participants`, `matches`, `match_events` y `standings`: lectura para cualquier usuario autenticado; ninguna escritura.
- `match_events` INSERT, solo si: `created_by` es el usuario; el participante es suyo; el partido está `ACTIVE` y el participante juega en él; el jugador pertenece al club del participante. Sin UPDATE ni DELETE: los eventos son inmutables (los errores se corrigen con disputa).
- `lineups`: cada usuario solo la de su participante.
- `anon` (clave publishable sin login): sin políticas **y** sin grants. Verificado que no lee nada.
- `schema_migrations`: RLS activado y sin acceso para `anon`/`authenticated`.

Detalle técnico: los INSERT con `ON CONFLICT DO NOTHING` (reenvío idempotente de eventos) funcionan con RLS (verificado). Caso límite NO PROBADO, a comprobar en la fase de eventos: reenviar un evento ya guardado cuando el partido dejó de estar `ACTIVE` probablemente falle por la política (el WITH CHECK se evalúa sobre la fila nueva). Es otra razón para bloquear "Finalizar" mientras haya cola pendiente.

## Qué hace el backend y no la BD

- Validar el JWT en cada petición y obtener `user_id` y rol desde `profiles`, nunca del cliente.
- Máquina de estados de partido (UPDATE condicional → 409), fecha activa, calendario, marcador derivado de eventos.
- Todas las operaciones de admin.
- Decidir destinatarios del WebSocket.

## Cuándo se usa la clave secreta (`SUPABASE_SECRET_KEY`)

Solo en el backend, y solo para: operaciones de admin, seed/scraper, la función `assign_random_club`, escrituras de estado de partido y el listener de Realtime. Se salta RLS (rol `service_role`), por eso nunca va en la app, en logs ni en el repositorio (`backend/.env` está en `.gitignore`).

Operaciones de participante (insertar eventos, su alineación, editar su perfil) usan un cliente con el JWT del usuario, para que RLS aplique.

Verificado en `test_rls.py`: la clave secreta puede cambiar el estado de un partido y llamar a `assign_random_club`; el usuario normal recibe 42501 en ambos.

## Funciones

- `assign_random_club`: `SECURITY INVOKER` a propósito (no necesita más poder, el llamador `service_role` ya se salta RLS). `EXECUTE` revocado a `public`, `anon` y `authenticated`, concedido solo a `service_role`.
- `handle_new_user` (trigger sobre `auth.users`): `SECURITY DEFINER` porque `auth.users` es de otro rol; `search_path = ''` para que nadie pueda secuestrar nombres de objetos; `EXECUTE` revocado a todos los roles de la API.

## Límites conocidos

- La vista `standings` usa `security_invoker`: respeta RLS, y solo muestra lo que el usuario ya puede leer.
- Los INSERT del backend con clave secreta no pasan por las políticas de `match_events`: ahí la validación (equipo propio, jugador del club, partido activo) depende del backend. Si se quisiera blindar también eso, el siguiente paso sería un trigger `BEFORE INSERT` en la tabla.
- Todos los usuarios autenticados leen todos los partidos y eventos (es un torneo entre amigos; la regla de negocio lo permite).
