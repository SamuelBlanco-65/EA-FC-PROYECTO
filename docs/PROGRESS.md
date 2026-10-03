# Progreso del proyecto

Fases 0-6 cerradas (0 PARCIAL: faltan QR y Expo Go). Siguiente: Fase 7, cuando el usuario la indique.
Aquí solo las 2 últimas fases; las anteriores están en `docs/progress-archive.md`.

## Fase 6 – Realtime, WebSocket y bot visitante – 2026-10-03
Estado: COMPLETA
Hecho (VERIFICADO):
- Listener de Supabase Realtime (`realtime/listener.py`, `postgres_changes` de `matches` y `match_events`, clave secreta) arrancado en el lifespan, con supervisor propio: vigila cada 5 s, reconstruye con backoff 1-30 s y tras cada recuperación envía `RESYNC_REQUIRED`. API de `realtime` 2.32.0 comprobada leyendo el código y ejecutando (ver `docs/VERSIONES.md`).
- `/ws`: AUTH por primer mensaje (5 s), cierres 4401 con razón estable, PING/PONG, cierre al expirar el token. `ConnectionManager` (varios sockets por usuario, timeout 5 s por socket). Traductor puro, 8 eventos pedidos, avisos de partido solo a los 2 jugadores, globales a todos; ráfagas (600 inserts, fecha entera) = 1 evento.
- Cadena completa contra Supabase real con uvicorn real y clientes `websockets` (`test_realtime_real.py`): torneo, fecha, gol, finalizar, rechazar, resolver, confirmar. Latencia desde que vuelve la respuesta HTTP: 27-330 ms. El tercer jugador y (en gol) el admin no reciben avisos del partido ajeno.
- `visitor_bot.py` y `simulate_match.py` probados contra uvicorn real (puerto 8001): caso aprobado (CONFIRMED 2-1), disputa + resolución admin (RESOLVED 1-1), `--scenario both` con visitante simulado, reconexión del bot tras parar y reiniciar el servidor.
- `python -m pytest` (backend): 371 passed (333 sin integración). Mutaciones: público de los avisos y deduplicación hacen fallar tests; la de autenticación se detecta por bloqueo. BD limpia al terminar (0 torneos; usuarios solo admin + participant01..05).
No probado / pendiente:
- Recuperación del listener ante una caída REAL de Supabase Realtime: solo con cliente simulado. `RESYNC_REQUIRED` no es de los 8 pedidos: lo añadí yo (sin él un cliente conectado se queda con datos viejos).
- Los admin no reciben `MATCH_DISPUTED`/eventos de partido (decisión para la fase de admin). Espejo `mobile/src/realtime/events.ts`: pendiente (Fase 8). wss/HTTPS: Fase 7.
- Seguía sin existir endpoint para CREAR el torneo (hoy SQL), `FINISHED` nunca se alcanza, y `/media/...` sin implementar. Un uvicorn `--reload` tuyo seguía en el puerto 8000 (no lo toqué; mis pruebas usaron el 8001).
Decisiones clave: Realtime en vez de emitir tras mutar; audiencia aprendida de las filas (la consulta REST por aviso costaba ~1,4 s); el WebSocket solo notifica.
Archivos principales: `backend/app/realtime/{events,translator,dispatcher,audience,connection_manager,listener,hub}.py`, `backend/app/api/ws.py`, `backend/app/repositories/audience_repository.py`, `scripts/demo/{visitor_bot,simulate_match,_common}.py`, `backend/tests/{realtime,api/test_ws.py,integration/test_realtime_real.py}`, `docs/architecture/realtime.md`, `docs/defense/realtime.md`.
Cómo probarlo (PowerShell): `cd backend; .\venv\Scripts\python.exe -m pytest tests\realtime tests\api\test_ws.py` (sin red) y `.\venv\Scripts\python.exe -m pytest tests\integration\test_realtime_real.py -s` (Supabase real, ~40 s). Dos terminales: ver `docs/architecture/realtime.md` (final).
Siguiente paso: Fase 7 (la define el usuario).

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
