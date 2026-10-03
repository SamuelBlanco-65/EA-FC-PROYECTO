# Tiempo real: Supabase Realtime -> backend -> WebSocket -> app

Regla de la arquitectura: la app solo habla con el backend. El backend escucha los cambios de la base y avisa
por su propio WebSocket (`/ws`). **El WebSocket solo NOTIFICA**; la base de datos es la verdad.

## Piezas (`backend/app/realtime/`, `backend/app/api/ws.py`)

| Pieza | Archivo | Qué hace |
|---|---|---|
| Listener | `listener.py` | Se suscribe a `postgres_changes` de `matches` y `match_events` con la clave secreta. Supervisor propio: vigila, reconstruye y reconecta. |
| Traductor | `translator.py` | **Función pura**: cambio de Postgres -> mensaje tipado + a quién va. Sin red. |
| Destinatarios | `audience.py` | Quiénes son los dos jugadores de un partido (caché; casi nunca consulta). |
| Despachador | `dispatcher.py` | Cola en orden de llegada; deduplica ráfagas; envía. |
| Conexiones | `connection_manager.py` | `user_id -> {sockets}`. Envío concurrente con timeout de 5 s por socket. |
| Ruta | `api/ws.py` | `/ws`: autenticación por primer mensaje, `PING/PONG`, cierre al expirar el token. |
| Mensajes | `events.py` | Modelos Pydantic con `type` literal (unión discriminada). |

Se arrancan en el *lifespan* de FastAPI (`main.py` -> `RealtimeHub`). Con `REALTIME_LISTENER_ENABLED=false` no arranca el listener (`/ws` sigue aceptando).

## Handshake de confirmación (secuencia)

```mermaid
sequenceDiagram
    autonumber
    participant L as Móvil local (Android)
    participant V as Móvil visitante / bot
    participant API as Backend REST
    participant DB as Postgres (Supabase)
    participant RT as Supabase Realtime
    participant LS as Listener + Dispatcher (backend)
    participant WS as /ws (ConnectionManager)

    V->>WS: conecta y envía {"type":"AUTH","token":"..."}
    WS-->>V: {"type":"AUTH_OK"}  (JWT validado + perfil en BD)
    L->>API: POST /matches/{id}/finish
    API->>DB: UPDATE matches SET status='PENDING_CONFIRMATION', scores... WHERE status='ACTIVE'
    API-->>L: 200 (marcador derivado de los GOAL)
    DB-->>RT: WAL: UPDATE en matches (commit hecho)
    RT-->>LS: postgres_changes (fila nueva completa)
    LS->>LS: translate() -> MATCH_RESULT_PENDING, audiencia = {local, visitante}
    LS->>WS: send_to_users({local, visitante})
    WS-->>V: {"type":"MATCH_RESULT_PENDING","matchId","homeScore","awayScore"}
    WS-->>L: {"type":"MATCH_RESULT_PENDING", ...}
    V->>API: POST /matches/{id}/confirm   (o /reject)
    API->>DB: UPDATE ... WHERE status='PENDING_CONFIRMATION'
    DB-->>RT-->>LS: cambio
    LS->>WS: MATCH_CONFIRMED (a los 2) + STANDINGS_UPDATED (a todos)
```

La notificación solo lleva ids y el marcador; la app, al recibirla, vuelve a pedir el partido/tabla por REST.

## Mensajes (servidor -> app), camelCase

| `type` | Origen (cambio en BD) | Destinatarios |
|---|---|---|
| `MATCH_EVENT_CREATED` | INSERT en `match_events` | los 2 jugadores del partido |
| `MATCH_RESULT_PENDING` | `matches` -> `PENDING_CONFIRMATION` | los 2 jugadores |
| `MATCH_CONFIRMED` | `matches` -> `CONFIRMED` | los 2 jugadores |
| `MATCH_DISPUTED` | `matches` -> `DISPUTED` | los 2 jugadores |
| `MATCH_RESOLVED` | `matches` -> `RESOLVED` | los 2 jugadores |
| `STANDINGS_UPDATED` | `CONFIRMED` o `RESOLVED` | **todos** los conectados |
| `ROUND_ACTIVATED` | `matches` -> `ACTIVE` | **todos** |
| `TOURNAMENT_STARTED` | INSERT en `matches` | **todos** |
| `AUTH_OK`, `PONG` | protocolo del socket | el propio socket |
| `AUTH_ERROR` (`{"type":"AUTH_ERROR","code":"<razón>"}`) | justo antes de cada cierre del servidor (Fase 7) | el propio socket |
| `RESYNC_REQUIRED` | el backend perdió y recuperó el enlace con Realtime | **todos** (añadido por mí, no estaba en la lista: ver "Si el listener se cae") |

Cliente -> servidor: `{"type":"AUTH","token":"..."}` (obligatorio, primer mensaje, 5 s) y `{"type":"PING"}`.
Cierres: `4401` + razón estable (`AUTH_TIMEOUT`, `AUTH_REQUIRED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `PROFILE_NOT_FOUND`); `1013` si Supabase no responde al validar. El token **no** va en la URL (acabaría en logs). El socket se cierra al expirar el token (4401 `TOKEN_EXPIRED`): la app renueva la sesión y reconecta.
**La app debe decidir por el mensaje `AUTH_ERROR`, no por el código de cierre.** Medido en Render (Fase 7, ver `deploy.md`): la trama de cierre con 4401 no llega al cliente, que ve un cierre anormal ~21 s después, mientras que las tramas de datos (`AUTH_OK`, `PONG`, `AUTH_ERROR`) sí llegan. Por eso el servidor envía `AUTH_ERROR` con la misma razón antes de cerrar. Con `1013` la razón es `UPSTREAM_UNAVAILABLE` (reintentar más tarde, no refrescar el token). El código de cierre se mantiene por si el cliente lo recibe (en local sí llega).

Detalles que importan:
- Una acción de varias filas (`start_tournament` inserta 600 partidos; `activate_round` actualiza una fecha entera) llega como una fila por mensaje. `dedup_key` (`started:<torneo>`, `round:<torneo>:<n>`) las convierte en **un** evento. `STANDINGS_UPDATED` no se deduplica a propósito: dos partidos confirmados seguidos son dos cambios de tabla.
- Los cambios se procesan **en orden de llegada** (una sola cola), así `MATCH_CONFIRMED` nunca adelanta a `MATCH_RESULT_PENDING`.
- Quién está conectado se decide en el backend; el cliente no elige suscripciones (no puede espiar partidos ajenos).

## ¿Y si el receptor está desconectado?
No pasa nada malo, y es por diseño: el mensaje **se pierde para él, el dato no**. El estado (`PENDING_CONFIRMATION`, eventos, marcador) ya está en Postgres. Al reconectar, la app hace `AUTH` y vuelve a pedir su estado por REST (`GET /tournament/fixtures`, `GET /matches/{id}`, tabla). Probado con `visitor_bot.py`: al reconectar, consulta `/tournament/fixtures` y responde a los resultados que ya estaban esperando. No hay cola de mensajes ni reintento del lado del servidor: serían estado duplicado que mantener y que puede quedar viejo.

## Si el listener se cae
La librería `realtime` 2.32.0 solo reconecta tras `ConnectionClosedError`; si agota reintentos dentro de su tarea interna o el servidor cierra limpiamente, la tarea muere sin avisar (VERIFICADO leyendo el código instalado). Por eso `auto_reconnect=False` y el supervisor de `listener.py`: cada 5 s comprueba cliente conectado, canal unido y estado del websocket; si algo falla, cierra, espera con backoff exponencial (1, 2, 4... 30 s) y reconstruye. Tras **cada** recuperación (no tras el primer arranque) envía `RESYNC_REQUIRED` a los conectados, porque los cambios ocurridos durante la caída no se reponen: la app debe refrescar por REST. Es el único mensaje fuera de los 8 pedidos; sin él, un cliente conectado se quedaría con datos viejos sin enterarse.

## ¿Por qué Supabase Realtime y no emitir directamente tras la mutación?
Alternativa descartada: en cada endpoint, después del `UPDATE`, llamar a `manager.send(...)`.
- **Una sola fuente de verdad.** Cualquier cambio en la tabla genera aviso: una función SQL (`activate_round` actualiza muchas filas), un arreglo manual del admin en SQL, o un endpoint futuro al que se le olvide emitir. Con "emitir tras mutar", cada ruta debe acordarse.
- **Escala a varias instancias del backend.** Emitir en memoria solo llega a los sockets de *esa* instancia. Con Realtime, cada instancia recibe todos los cambios y avisa a sus propios sockets (sin duplicados: cada socket vive en una).
- **Avisa después del commit.** El aviso sale de la replicación lógica, no de "creo que ya guardé".
- Coste: un salto más y una dependencia más. Medido: **27-330 ms** después de que el servidor responde la petición (ver `docs/defense/realtime.md`). Si Realtime cae, las acciones REST siguen funcionando; solo se pierden los avisos (y `RESYNC_REQUIRED` cubre el hueco).

## Seguridad
- El listener usa la clave secreta (solo backend). Con ella, Realtime entrega todas las filas pese a la RLS (VERIFICADO en `tests/integration/test_realtime_real.py`). La clave viaja a Supabase como parámetro `apikey` de la URL del websocket de la librería; el logger `realtime` se fija en WARNING y el formateador de logs enmascara `sb_secret_...` por si acaso.
- Las tablas ya estaban en la publicación `supabase_realtime` (migración 0007). No hizo falta migración nueva.
- Un participante no recibe avisos de partidos ajenos (probado con 4 sockets reales y con sockets simulados). Los administradores reciben los eventos globales; **no** reciben los de partido (pendiente decidir en la fase de admin si deben recibir `MATCH_DISPUTED`).

## Probarlo con dos terminales (PowerShell, raíz del repo)
Prerrequisitos: backend en marcha, cuentas demo (`create_users.py`) y un torneo `DRAFT` (se inserta por SQL: aún no hay endpoint para crearlo).
```
# Terminal 1: dos bots; el que sea visitante responde, el local se ignora (403 NOT_MATCH_AWAY)
backend\venv\Scripts\python.exe scripts\demo\visitor_bot.py --email participant01@example.com --approve
backend\venv\Scripts\python.exe scripts\demo\visitor_bot.py --email participant02@example.com --approve
# Terminal 2: partido completo
backend\venv\Scripts\python.exe scripts\demo\simulate_match.py --scenario approved --visitor bot
backend\venv\Scripts\python.exe scripts\demo\simulate_match.py --scenario dispute --visitor bot   # bots con --reject
```
Con un solo teléfono: el teléfono es el local (finaliza) y `visitor_bot.py` es el visitante. Cada línea lleva hora con milisegundos para comparar a ojo las dos terminales.
