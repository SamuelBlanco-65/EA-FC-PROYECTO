# Defensa – Fase 6: tiempo real y WebSocket

## Qué hace y flujo
1. Al arrancar (`main.py` lifespan -> `realtime/hub.py`) el backend abre **una** suscripción a Supabase Realtime (`realtime/listener.py`) a los cambios de `matches` y `match_events`, con la clave secreta.
2. Cada cambio entra en una cola (`dispatcher.py`). `translator.py` (función pura) lo convierte en un mensaje tipado (`events.py`) y decide el público: los 2 jugadores del partido (`audience.py`) o todos.
3. `connection_manager.py` entrega a los sockets abiertos de esos usuarios. Los desconectados se saltan: al volver, la app consulta REST.
4. `/ws` (`api/ws.py`): el primer mensaje debe ser `{"type":"AUTH","token":...}` (5 s); se valida igual que en REST (JWKS + perfil en BD). El socket se cierra al expirar el token.
5. `scripts/demo/visitor_bot.py` hace de visitante; `simulate_match.py` juega un partido completo por HTTP (aprobado y disputa + resolución admin).

## Decisiones
- **Realtime en vez de emitir tras cada mutación.** Una sola fuente (también cubre funciones SQL y arreglos manuales), funciona con varias instancias, avisa tras el commit. Coste: un salto más (27-330 ms medidos) y depender de Realtime. Ver `docs/architecture/realtime.md`.
- **Supervisor propio del listener.** La librería solo reconecta tras `ConnectionClosedError`; otros fallos matan su tarea en silencio. Coste: ~100 líneas propias y leer un atributo privado (`_ws_connection.state`, protegido con `getattr`).
- **Audiencia sin consultar la BD al notificar.** Medido: 2 consultas REST seguidas por notificación sumaban ~1,4 s desde mi PC. Ahora los participantes se aprenden de la propia fila de `matches`, se precalientan al arrancar y la consulta es solo el último recurso. Coste: caché en memoria (datos inmutables: no hay invalidación).

## Preguntas probables
1. *¿Por qué no mandas el gol por el WebSocket directamente?* Porque el WebSocket solo notifica; la verdad es la BD. Si el mensaje se pierde, el dato no. La app, al recibir el aviso, relee por REST.
2. *¿Qué pasa si el visitante está desconectado cuando el local finaliza?* No recibe el aviso; el partido queda `PENDING_CONFIRMATION` en la BD. Al reconectar pide `/tournament/fixtures` y lo ve (el bot lo hace así; probado). El admin también puede resolverlo si nunca responde.
3. *¿Cómo evitas que un jugador reciba avisos de partidos ajenos?* El cliente no elige a qué suscribirse: el backend calcula el público desde la BD. Probado con 4 sockets reales y con sockets simulados.
4. *¿Por qué el token va en el primer mensaje y no en la URL?* Las URLs acaban en logs de proxys y servidores. Sin AUTH en 5 s, o con token malo, se cierra con 4401, pero antes se envía `{"type":"AUTH_ERROR","code":...}`: en Render la trama de cierre no llegaba al cliente (lo medí) y las de datos sí.
5. Difícil: *Si Supabase Realtime se cae 10 s, ¿pierdes eventos?* Sí, esos avisos se pierden (no hay cola). Al recuperar, el supervisor envía `RESYNC_REQUIRED` y la app refresca por REST; nada se pierde en la BD. NO probado contra una caída real de Supabase, solo con un cliente simulado (ver "No probado" en PROGRESS.md). Contra-contrapregunta: *¿y si el backend mismo se reinicia?* Los sockets se cierran, la app reconecta con backoff y vuelve a pedir el estado (probado con el bot).

## Errores típicos y manejo
Mensaje no traducible (fila rara) -> se registra el tipo de error y se ignora, el bucle sigue. Socket lento o roto -> timeout de 5 s, se desconecta solo ese. Falla la consulta de audiencia -> se registra y se pierde ese aviso (la BD no). Cola llena (>5000) -> se descarta y se registra. Supabase caído al validar el token -> cierre `1013`. Cierres `4401` con razón estable: `AUTH_TIMEOUT`, `AUTH_REQUIRED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `PROFILE_NOT_FOUND`.

## Números reales (una medición, mi PC, Supabase remoto)
Desde que **vuelve la respuesta HTTP** hasta que el mensaje llega a un socket: inicio de torneo 27 ms, activar fecha 111 ms, gol 330 ms, finalizar 48 ms. Con uvicorn real, el bot recibió `MATCH_RESULT_PENDING` 15 ms **antes** de que el simulador recibiera la respuesta del "finalizar". Ojo: cada petición REST tarda 0,7-1,4 s desde mi PC (viaje a Supabase), por eso "desde que se envía la petición" sale 0,8-2,5 s: es el REST, no el tiempo real.
