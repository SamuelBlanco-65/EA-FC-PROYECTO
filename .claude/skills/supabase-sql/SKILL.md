---
name: supabase-sql
description: Convenciones de base de datos del proyecto EA FC: migraciones SQL, tablas, restricciones, RLS, funciones atómicas y publicación de Realtime en Supabase. Usar al crear o modificar archivos en supabase/migrations o scripts/db.
---

# Supabase / PostgreSQL – convenciones

## Migraciones
- Archivos `supabase/migrations/NNNN_descripcion.sql`, numerados, nunca se editan una vez aplicados: se crea uno nuevo.
- Se aplican con `scripts/db/apply_migrations.py` usando `DATABASE_URL` (cadena de conexión de Supabase) y una tabla `schema_migrations` para no reaplicar. Idempotente.

## Modelo base
- `profiles(id uuid PK -> auth.users, display_name, role ENUM('participant','admin'), created_at)`. Se crea por trigger al registrarse un usuario. El rol por defecto es participant.
- `clubs(id, name, short_name, league, country, league_rank, external_source_id UNIQUE, primary_color, secondary_color, crest_path NULL)`.
- `players(id, external_source_id UNIQUE, club_id FK, name, position, overall_rating NULL, age NULL, nationality NULL, shirt_number NULL, photo_path NULL)`. Un jugador pertenece a un club en el momento del scraping (no hace falta tabla N:M; justificar en la defensa).
- `tournaments(id, name, status ENUM('DRAFT','ACTIVE','FINISHED'), current_round int default 0, max_participants int default 25, started_at)`.
- `tournament_participants(id, tournament_id, user_id, club_id, joined_at, UNIQUE(tournament_id,user_id), UNIQUE(tournament_id,club_id))`.
- `matches(id, tournament_id, round, leg 1|2, home_participant_id, away_participant_id, status ENUM, home_score NULL, away_score NULL, finished_at, confirmed_at, resolved_by, resolution_note, CHECK(home <> away))`.
- `match_events(id uuid PK (lo genera el cliente), match_id, participant_id, player_id, type ENUM('GOAL','YELLOW','RED'), minute CHECK 1..120, created_by, created_at)`.
- `lineups(participant_id PK, formation text, positions jsonb, updated_at)`; positions = `[{"playerId": "...", "x": 0..1, "y": 0..1}]`.
- Vista `standings` calculada desde matches CONFIRMED/RESOLVED.
- Índices: matches(tournament_id, round), matches(status), match_events(match_id), players(club_id).

## RLS
- `ENABLE ROW LEVEL SECURITY` en todas las tablas. Sin políticas para `anon`.
- Lectura `authenticated`: clubs, players, tournaments, participants, matches, match_events, standings.
- profiles: cada usuario lee y edita solo el suyo; el rol no es editable por el usuario.
- match_events INSERT: solo si participant_id pertenece a auth.uid() y el partido está ACTIVE (defensa en profundidad; el backend ya lo valida).
- lineups: cada usuario solo la suya.
- Escrituras de estado de partido y admin: solo con clave secreta desde el backend.
- Probar las políticas con un script que use el JWT de un usuario normal e intente leer/escribir lo prohibido.

## Funciones atómicas
- `assign_random_club(p_tournament uuid, p_user uuid)`: si ya tiene club lo devuelve; si no, elige un club libre al azar e inserta; ante `unique_violation` reintenta (máx. 5); sin clubes libres -> error controlado. Torneo debe estar DRAFT.
- Si una función es `SECURITY DEFINER`, fijar `search_path` y validar permisos dentro; revocar EXECUTE a anon/authenticated si solo la llama el backend con clave secreta.

## Imágenes (escudos y fotos)
- Bucket PRIVADO de Supabase Storage `media` con rutas `crests/<external_source_id>.png` y `players/<external_source_id>.png`. La BD guarda solo la ruta (`crest_path`, `photo_path`), no la imagen.
- La app nunca accede a Storage: las sirve el backend (ver backend-fastapi).

## Realtime
- Añadir `matches` y `match_events` a la publicación de Realtime de Supabase (VERIFICAR el procedimiento actual en la documentación oficial).
