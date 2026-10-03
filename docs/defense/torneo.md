# Defensa – Fase 4: inscripción, calendario y tabla

## Qué hace y flujo
**Inscripción (`POST /participants/me/assign-club`)**
1. `api/participants.py` exige usuario (`get_current_user`); el cuerpo se ignora: la app nunca manda `clubId`.
2. `services/tournament_service.py::assign_club`: lee el torneo actual (el más reciente; el MVP tiene uno), busca si el usuario ya está inscrito (`find_own`, con su JWT, RLS). Si lo está, lo devuelve con `alreadyAssigned=true` sin tocar la BD.
3. Si no, `participant_repository.py::assign_random_club` llama por RPC a la función SQL `assign_random_club` (migración 0005) con la **clave secreta**: la función está revocada para `anon`/`authenticated`, así nadie puede elegir o repetir club desde fuera del backend.
4. La función bloquea la fila del torneo (`FOR UPDATE`), comprueba DRAFT y cupo, elige un club libre al azar e inserta; ante `unique_violation` reintenta (máx. 5). Sus errores (`TOURNAMENT_FULL`, ...) se traducen a HTTP 409/404/503 con el mismo código estable.
5. Respuesta: participante, club asignado y `rouletteClubs` (los 25 clubes) para animar la ruleta.

**Lectura** (`GET /tournament`, `/tournament/standings`, `/tournament/fixtures`): router -> `TournamentService` -> `TournamentRepository`, siempre con el JWT del usuario (RLS). La tabla sale de la vista SQL `standings` (migración 0004), ordenada por `position`.

**Calendario**: `domain/round_robin.py` (función pura, ver `docs/domain/calendar.md`). Aún nadie la llama: persistir partidos es la fase del admin.

## Decisiones
- **Tabla en una vista SQL, no en Python.** Por qué: una sola fuente de verdad, se recalcula sola en cada lectura y el orden (PTS, DG, GF, nombre) vive junto a los datos. Descartado: función de dominio duplicada (dos implementaciones que pueden divergir). Coste: probarla exige BD real (`tests/integration/test_standings_view.py`, transacciones que se deshacen).
- **La concurrencia se resuelve en la BD, no en Python.** Por qué: varias instancias o hilos del backend verían el mismo estado; el bloqueo de fila + `UNIQUE(tournament_id, club_id)` lo hacen imposible de romper. Descartado: un `Lock` en memoria (solo vale para un proceso). Coste: los inscritos se serializan (milisegundos; 25 usuarios).
- **HTTP/1.1 en el cliente compartido hacia Supabase.** Por qué: con HTTP/2 todos los hilos compartían una conexión; al caerla el servidor (`RemoteProtocolError: Server disconnected`) murieron a la vez 9 de 15 peticiones simultáneas (2 fallos en 3 ejecuciones). Con HTTP/1.1: 0 fallos en 5. Coste: más conexiones TCP. **Causa raíz del corte del servidor: NO DETERMINADA**; la mitigación está medida, la explicación no.

## Preguntas probables
1. *¿Cómo evitas que dos usuarios reciban el mismo club?* `UNIQUE(tournament_id, club_id)` + función SQL con bloqueo y reintento. Probado: 25 inscripciones simultáneas por HTTP real -> 25 clubes distintos (`test_assign_club_concurrency.py`).
2. *¿Qué pasa con el usuario 26?* La función lanza `TOURNAMENT_FULL`; la API responde 409 con ese código y no inserta nada (probado).
3. *¿Por qué es idempotente y para qué sirve?* Reintentos de red o doble toque devuelven el mismo club (probado). `alreadyAssigned` deja que la app salte la animación.
4. *¿Qué garantiza el calendario?* Tests para N=2,3,4,5,6,25: nadie contra sí mismo, cada pareja 2 veces con local invertido, nadie dos veces por ronda, rondas y partidos correctos, un descanso por ronda si N es impar.
5. Difícil: *Si dos peticiones del mismo usuario llegan a la vez, ¿ambas dicen `alreadyAssigned=false`?* Sí, es una carrera conocida y benigna: la función SQL devuelve la misma fila a las dos, así que los datos son correctos; solo el indicador de la animación puede repetirse. Está documentado en `assign_club` y NO tiene test propio.

## Errores típicos
- 404 `TOURNAMENT_NOT_FOUND`: no hay torneo (crearlo es de la fase admin). 409 `TOURNAMENT_NOT_DRAFT`: inscripción cerrada. 409 `TOURNAMENT_FULL` / `NO_FREE_CLUBS`. 503 `ASSIGNMENT_RETRIES_EXHAUSTED`: reintentar. 503 `UPSTREAM_UNAVAILABLE`: Supabase no responde.
- `crestUrl` apunta a `/media/crests/{id}`, ruta que **aún no existe** (fase de media).
