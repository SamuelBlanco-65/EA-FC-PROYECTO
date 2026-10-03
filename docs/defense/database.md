# Defensa – Fase 1: base de datos, RLS y asignación atómica de club

## Qué hace y flujo
1. `scripts/db/apply_migrations.py` lee `supabase/migrations/*.sql` en orden, aplica cada una en UNA transacción junto con su fila en `schema_migrations` (checksum SHA-256) y se niega a continuar si un archivo ya aplicado fue modificado. Re-ejecutarlo no hace nada.
2. `0002_tables.sql` crea tablas y restricciones; `0003` el trigger que crea el `profile` al registrarse; `0004` la vista `standings`; `0005` `assign_random_club`; `0006` RLS y permisos; `0007` publica `matches` y `match_events` en Realtime.
3. Pruebas: `test_schema.py` (restricciones, vista, función; transacción que se revierte), `test_assign_club.py` (concurrencia real), `test_rls.py` (JWT reales por PostgREST).

## Decisiones
- **Unicidad en la BD, no solo en el backend.** Alternativa descartada: comprobar "¿está libre el club?" en Python y luego insertar. Entre la comprobación y el insert otra petición puede colarse (condición de carrera). Coste: hay que manejar el error `unique_violation`.
- **Función SQL con bloqueo de fila del torneo + reintento.** Alternativa: bucle en el backend con varias llamadas. Descartada porque cada ida y vuelta abre una ventana de carrera y la lógica no sería atómica. Coste: lógica de negocio en SQL (solo esta función).
- **RLS + permisos mínimos por columna.** Alternativa: RLS sin tocar GRANTs; RLS no restringe columnas, así que el usuario podría cambiarse el `role`. Con `GRANT UPDATE (display_name)` es imposible. Coste: hay que conceder explícitamente cada operación.

## Cómo explicar `UNIQUE(tournament_id, club_id)` (como al profesor)
"Un club solo puede tener un dueño por torneo. Lo garantiza un índice único de Postgres sobre el par (torneo, club). El índice es atómico: si dos inserciones intentan el mismo par a la vez, una confirma y la otra recibe `unique_violation`. Ninguna lógica de la aplicación puede ofrecer esa garantía bajo concurrencia. Es una restricción por torneo: el mismo club puede estar en otro torneo. Es la red de seguridad: aunque mi función tuviera un bug, la BD no permitiría duplicados."

## Cómo explicar `assign_random_club(p_tournament, p_user)`
1. Bloquea la fila del torneo (`SELECT ... FOR UPDATE`): las inscripciones de ese torneo se ejecutan una a una. Así "¿hay cupo?" y "¿sigue en DRAFT?" no cambian entre la comprobación y el insert.
2. Si el usuario ya está inscrito, devuelve su club (idempotente: reintentar un POST no cambia el resultado).
3. Rechaza con códigos estables: `TOURNAMENT_NOT_FOUND`, `TOURNAMENT_NOT_DRAFT`, `USER_NOT_FOUND`, `TOURNAMENT_FULL`.
4. Elige al azar un club libre (`ORDER BY random() LIMIT 1` sobre los clubes sin dueño en ese torneo) e inserta.
5. Si salta `unique_violation` por el club, vuelve a elegir (máx. 5 intentos); si salta por el usuario, devuelve el existente. Sin clubes libres: `NO_FREE_CLUBS`.
6. Solo la ejecuta el backend con la clave secreta (`EXECUTE` revocado a `anon`/`authenticated`). La ruleta de la app solo anima el resultado; la app nunca envía `clubId`.
Verificado (VERIFICADO): 6 usuarios simultáneos contra 4 clubes, 10 rondas → nunca un club repetido, los sobrantes reciben `NO_FREE_CLUBS`; torneo con tope 3 y 6 usuarios → exactamente 3 dentro, 3 con `TOURNAMENT_FULL`.

## Preguntas probables
1. *¿Por qué RLS si ya validas en el backend?* Defensa en profundidad: si el backend tiene un bug o se filtra la clave publishable, la BD sigue negando lo prohibido.
2. *¿Qué impide que un usuario se haga admin?* No hay GRANT de UPDATE sobre `role`; el trigger de alta ignora el `role` de los metadatos del registro. Probado: 42501 y el rol sigue siendo `participant`.
3. *¿Cómo evitas duplicar un evento reenviado desde la cola offline?* El `id` lo genera el cliente; `INSERT ... ON CONFLICT (id) DO NOTHING` (probado con RLS activo).
4. *¿La tabla de posiciones se guarda?* No: es una vista sobre partidos CONFIRMED/RESOLVED; nunca se desincroniza.
5. Difícil: *Con `FOR UPDATE` ya hay exclusión; ¿para qué el reintento y el UNIQUE?* El bloqueo serializa inscripciones por torneo, pero el UNIQUE sigue siendo la garantía final (otro código, una carga manual, un bug futuro) y el reintento cubre carreras si se quita el bloqueo. Defensa en profundidad, con un coste mínimo.

## Errores típicos y cómo se manejan
- Migración que falla: se revierte entera y el script se detiene sin registrarla.
- Archivo aplicado y luego editado: el script aborta por checksum (se crea una migración nueva).
- `DATABASE_URL` directa sin IPv6: usar la Session pooler (puerto 5432).
- Error de función SQL: el mensaje es un código estable que el backend traducirá a `{"error":{"code":...}}`.
