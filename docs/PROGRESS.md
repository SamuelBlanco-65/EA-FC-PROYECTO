# Progreso del proyecto

Fases 0-5 cerradas (0 PARCIAL: faltan QR y Expo Go). Siguiente: Fase 6, cuando el usuario la indique.
Aquí solo las 2 últimas fases; las anteriores están en `docs/progress-archive.md`.

## Fase 5 – Partidos, eventos y administración – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- `domain/match_state.py`: tabla de 6 transiciones + actor; 24 pares inválidos y 6 válidos probados uno a uno. `derive_score` y `round_is_closed` puros.
- 13 endpoints nuevos (en el OpenAPI de uvicorn real): `/admin/{tournament/start, rounds/next/activate, matches, matches/{id}/resolve, participants}`, `/matches/{id}[/events|/finish|/confirm|/reject]`, `/me/squad`, `/lineups/me` (GET/PUT). Migración 0010 aplicada (`start_tournament`, `activate_round`, solo `service_role`).
- Tests exigidos, con mutación (quitar la validación hace fallar el test): visitante con petición manipulada (3 variantes), visitante no finaliza, local no confirma/rechaza, fecha 2 bloqueada con la 1 abierta (ACTIVE/PENDING/DISPUTED), reenvío no duplica.
- Flujo completo contra Supabase real (`test_match_flow_real.py`): RLS con `ON CONFLICT`, insert directo ajeno -> `42501`, funciones SQL llamadas sin el service (`ROUND_NOT_CLOSED`, `ROUND_CHANGED`, `TOURNAMENT_NOT_DRAFT`), marcador 3-2 derivado, tabla actualizada, disputa y resolución.
- `python -m pytest` (backend): 308 passed (con integración, ~2,5 min). BD limpia al terminar (0 torneos, 0 usuarios de prueba; 25 clubes, 677 jugadores).
No probado / pendiente:
- Carrera "gol que llega mientras el local finaliza": ventana de ms, sin test ni solución (ver `docs/defense/match.md`). Dos admins activando a la vez: solo la guarda SQL `ROUND_CHANGED` probada, no la concurrencia real.
- Sigue sin existir endpoint para CREAR el torneo (DRAFT); hoy se inserta por SQL. El torneo nunca pasa a `FINISHED` al cerrar la última fecha. Rutas `/media/...` y WebSocket/Realtime: siguen sin implementar.
- Con uvicorn real solo se probó sin token; los flujos autenticados se probaron con el TestClient de FastAPI (pila ASGI completa y BD real).
- Bug de infraestructura encontrado: borrar un torneo con eventos falla (`match_events.participant_id` sin CASCADE); el test borra los eventos antes. `backend/.env.example` fue borrado a propósito por el usuario: en `backend/` solo existe `.env` (decisión confirmada el 2026-10-03).
Decisiones clave: dos candados (service + BD); SQL solo para lo multi-fila; reenvío idempotente comprobado antes que el estado; `participantId` del cuerpo se compara, no se obedece.
Archivos principales: `backend/app/domain/{match_state,match}.py`, `backend/app/services/{match,admin,squad,common}_service.py`, `backend/app/repositories/{match,player,lineup}_repository.py`, `backend/app/api/{matches,admin,squad}.py`, `supabase/migrations/0010_*.sql`, `backend/tests/{domain,api,integration}/`.
Cómo probarlo (PowerShell): `cd backend; .\venv\Scripts\python.exe -m pytest tests\domain tests\api` (sin red) y `.\venv\Scripts\python.exe -m pytest tests\integration\test_match_flow_real.py` (Supabase real, ~1 min).
Siguiente paso: Fase 6 (la define el usuario).

## Fase 4 – Inscripción, calendario y tabla – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- `POST /participants/me/assign-club` (clave secreta + RPC `assign_random_club`), idempotente; `GET /tournament`, `/tournament/standings`, `/tournament/fixtures` (JWT del usuario, RLS). Las 5 rutas nuevas aparecen en el OpenAPI.
- `domain/round_robin.py`: 48 tests (N=2,3,4,5,6,25 + ejemplo exacto de 4 equipos). Tabla: vista SQL existente + 16 tests nuevos contra BD real (V/E/D, DG, GF, nombre, estados que no cuentan, sin partidos, torneos separados), con rollback.
- Concurrencia por HTTP real: 10 usuarios simultáneos -> 10 clubes distintos; luego 15 más -> 25 distintos; el 26º -> 409 `TOURNAMENT_FULL` sin insertar. 5 de 5 ejecuciones OK con HTTP/1.1. La BD quedó limpia (0 torneos/usuarios de prueba; 25 clubes, 677 jugadores).
- `python -m pytest` (backend): 137 passed (con integración). Docs: `docs/domain/calendar.md`, `docs/defense/torneo.md`.
No probado / pendiente:
- Nada llama aún a `generate_fixtures` ni crea torneos: iniciar torneo y guardar partidos es la fase admin, así `/tournament/fixtures` solo se probó vacío o con repositorio simulado.
- `crestUrl` apunta a `/media/crests/{id}`: ruta NO implementada. Los endpoints se probaron con el TestClient de FastAPI (pila ASGI completa y BD real), no arrancando uvicorn.
- Bug de infraestructura: con HTTP/2 el servidor cortaba la conexión compartida (`Server disconnected`, 9 de 15 peticiones fallaron, 2 de 3 ejecuciones). Cambiado a HTTP/1.1 (0 fallos en 5). Causa raíz del corte NO DETERMINADA.
- `backend/.env` ahora exige `SUPABASE_SECRET_KEY` (ya estaba para el scraper). `backend/.env.example` borrado a propósito por el usuario (ver Fase 5).
Decisiones clave: tabla = vista SQL (sin duplicar en Python); concurrencia resuelta en la BD; torneo "actual" = el más reciente; respuesta de la ruleta = los 25 clubes; `alreadyAssigned` calculado con una lectura previa (carrera benigna documentada).
Archivos principales: `backend/app/domain/{round_robin,tournament}.py`, `backend/app/services/tournament_service.py`, `backend/app/repositories/{tournament,participant,club}_repository.py`, `backend/app/api/{participants,tournament}.py`, `backend/app/schemas/tournament.py`, `backend/tests/{domain,api,integration}/`.
Cómo probarlo (PowerShell):
- `cd backend; .\venv\Scripts\python.exe -m pytest tests\domain tests\api` (sin red)
- `.\venv\Scripts\python.exe -m pytest tests\integration\test_standings_view.py tests\integration\test_assign_club_concurrency.py` (Supabase real, ~1 min)
Siguiente paso: Fase 5 (la define el usuario).
