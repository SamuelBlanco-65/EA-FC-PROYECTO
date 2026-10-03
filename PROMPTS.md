# Kit de prompts – EA FC Tournament (entrega 6 oct 2026)

## A. Antes de empezar (tú, ~45 min)
1. Instala en Windows: Git, Node.js LTS, Python 3 (marca "Add to PATH"), VS Code y Claude Code. Versiones exactas: las anotará el agente en `docs/VERSIONES.md`.
2. Instala **Expo Go** en tu Android 14 desde Play Store.
3. Crea un proyecto en supabase.com. Copia: URL del proyecto, clave publicable/anon, clave secreta/service role y la cadena de conexión de Postgres (los nombres en el panel pueden haber cambiado: VERIFICAR). En Auth, desactiva la confirmación por email para la demo (VERIFICAR dónde está ese ajuste).
4. Crea la carpeta del proyecto, copia dentro `CLAUDE.md` y la carpeta `.claude/` de este kit, ejecuta `git init`.
5. Abre la carpeta en VS Code, terminal integrada, ejecuta `claude`.

## B. Cómo trabajar con plan Pro (cuidar el límite de uso)
- Una fase por sesión. Al terminar una fase: `/clear` y pega el siguiente prompt. El contexto persiste gracias a CLAUDE.md + docs/PROGRESS.md.
- Si te quedas sin cupo a mitad de fase: al volver, abre sesión nueva y pega: `Lee docs/PROGRESS.md y continúa la fase N donde quedó. Revisa git status primero.`
- Nunca le pegues los secretos en el chat: tú los escribes en `backend/.env`.
- Al final de cada fase, LEE la ficha de `docs/defense/`. Ese es tu estudio para la defensa.

## C. Plan de 4 días
| Día | Fases |
|---|---|
| Vie 2 (noche) | 0, 1 |
| Sáb 3 | 2, 3, 4 |
| Dom 4 | 5, 6, 7 |
| Lun 5 | 8, 9, 10 |
| Mar 6 (mañana) | 11 + estudiar defensa |

Si vas atrasado, recorta en este orden (de lo primero que se sacrifica a lo último): animación elaborada de la ruleta → pantallas Perfil/Ajustes → pulido visual → tests extra. NO recortes: RLS, asignación atómica, calendario, handshake, offline, pizarra.

---

## Fase 0 – Preparación y verificación
```
Fase 0. Lee CLAUDE.md. Tareas:
1. Inspecciona la carpeta y git status.
2. Verifica versiones instaladas (node, npm, python, git) y consulta la documentación oficial actual de: Expo SDK estable, lista de librerías incluidas en Expo Go, react-native-skia, reanimated, gesture-handler, expo-screen-orientation, expo-secure-store, almacenamiento local para la cola offline, FastAPI, supabase-py, el cliente `realtime` de Python, y cómo validar JWT de Supabase hoy. Confirma que TODAS las librerías móviles corren en Expo Go; si alguna no, detente y explícame las opciones.
3. Crea la estructura de carpetas de CLAUDE.md, .gitignore (incluye .env, venv, node_modules, data/raw), backend/.env.example con placeholders (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, DATABASE_URL, CORS) y mobile/.env.example (EXPO_PUBLIC_API_URL).
4. Crea el venv del backend y un FastAPI mínimo con GET /health. Crea la app Expo con TypeScript y Expo Router en mobile/ y comprueba que arranca.
5. Escribe docs/VERSIONES.md (versión + fuente consultada) y docs/PROGRESS.md.
Criterio: /health responde 200 en local; `npx expo start` muestra el QR. Usa la skill cerrar-fase.
```

## Fase 1 – Base de datos, RLS y migraciones
```
Fase 1. Usa la skill supabase-sql. Tareas:
1. scripts/db/apply_migrations.py (idempotente, con tabla schema_migrations).
2. Migraciones: enums, tablas, restricciones, índices, trigger de profiles, vista standings, función assign_random_club, RLS de todas las tablas, publicación realtime de matches y match_events.
3. Script de prueba de RLS: con el JWT de un usuario normal, intenta leer el profile de otro, cambiar su propio rol, insertar evento de otro participante; todo debe fallar. Con usuario válido, lecturas permitidas deben funcionar.
4. docs/database/schema.md (diagrama Mermaid ER + por qué cada restricción) y docs/database/security.md (qué protege RLS, qué el backend, qué la autenticación, cuándo se usa la clave secreta).
Yo ya puse DATABASE_URL y claves en backend/.env. Aplica las migraciones y ejecuta las pruebas. Explícame la UNIQUE(tournament_id, club_id) y la función de asignación como si me lo preguntara el profesor. Cierra con cerrar-fase.
```

## Fase 2 – Backend base y autenticación
```
Fase 2. Usa la skill backend-fastapi. Tareas:
1. Config, errores estándar, logging seguro, CORS, estructura por capas.
2. POST /auth/register, /auth/login, /auth/refresh, GET /me con Supabase Auth detrás del backend. Dependencias get_current_user y require_admin.
3. scripts/demo/create_users.py: crea admin + participant01..N (N por argumento) vía API admin de Supabase con la clave secreta; contraseñas desde variables de entorno o un archivo local ignorado por git.
4. Tests: sin token -> 401, token inválido -> 401, participante en ruta admin -> 403, admin -> 200.
Criterio: Swagger en /docs muestra todo; puedo hacer login con participant01. Explica el flujo de un request autenticado de punta a punta. Cierra con cerrar-fase.
```

## Fase 3 – Scraping y seed (Python)
```
Fase 3. Tareas, en este orden:
1. Propón 2-3 fuentes candidatas para (a) clasificación final 2025-26 de las 5 ligas y (b) planteles actuales con posición, edad, nacionalidad, dorsal y, si es posible, valoración de EA FC, y (c) escudos oficiales y fotos de jugadores, preferiblemente en PNG (SVG complica la app y la conversión en Windows). Indica para las imágenes si los términos permiten descargarlas. Para cada una revisa robots.txt y términos de uso, di si el HTML es estático o requiere JavaScript, y qué datos trae. NO afirmes que está permitido si no está claro. DETENTE y espera que yo elija.
2. Tras mi elección: scraper con requests + BeautifulSoup (Selenium solo si es imprescindible), interfaz ScrapingSource para cambiar de fuente, pausas entre requests y User-Agent identificable.
3. Pipeline: raw (HTML/JSON guardado) -> parse -> normalize -> validate -> data/normalized/*.json -> seed.py con upsert por external_source_id (idempotente). Primero prueba con 1 club, luego los 25.
4. Descarga escudos y fotos a data/raw/media/, normaliza a PNG de tamaño razonable, súbelos al bucket privado `media` de Supabase Storage (upsert, idempotente) y guarda crest_path/photo_path. Imagen faltante = NULL + aviso en el resumen, nunca inventada.
5. Genera config/tournament-clubs.json con los 25 clubes y el criterio usado.
6. Resumen al final: clubes, escudos/fotos descargados y faltantes, jugadores encontrados/válidos/rechazados, errores por tipo. overall_rating puede quedar NULL si la fuente no lo da: dilo, no lo inventes.
Criterio: ejecutar seed.py dos veces no duplica nada. docs/scraping/scraping.md. Cierra con cerrar-fase.
```

## Fase 4 – Dominio: asignación, calendario y tabla
```
Fase 4. Tareas:
1. POST /participants/me/assign-club: llama a assign_random_club con el user_id del JWT; idempotente (si ya tiene club, lo devuelve). Respuesta con el club y la lista de clubes para animar la ruleta.
2. domain/round_robin.py (método del círculo, ida y vuelta, BYE) con tests para N = 2, 3, 4, 5, 6 y 25: nadie juega contra sí mismo, cada pareja exactamente 2 veces con local invertido, nadie juega 2 veces en una ronda, número de rondas y partidos correcto, impares con un descanso por ronda.
3. domain/standings.py (o vista SQL + test) con tests de victoria, empate, derrota, DG y desempates.
4. Test de concurrencia: 10 asignaciones simultáneas con 10 usuarios distintos -> 10 clubes distintos, 0 duplicados; y 26º usuario -> error controlado TOURNAMENT_FULL.
5. GET /tournament, /tournament/standings, /tournament/fixtures.
docs/domain/calendar.md con el algoritmo explicado con un ejemplo de 4 equipos. Cierra con cerrar-fase.
```

## Fase 5 – Motor de partido y administración
```
Fase 5. Tareas:
1. domain/match_state.py: máquina de estados de CLAUDE.md con tabla de transiciones y tests de cada transición válida e inválida.
2. Endpoints: POST /admin/tournament/start (genera calendario), POST /admin/rounds/next/activate, GET /matches/{id} (con eventos), POST /matches/{id}/events (idempotente por id), POST /matches/{id}/finish (solo local; marcador derivado de GOAL), POST /matches/{id}/confirm y /reject (solo visitante), GET /admin/matches?status=, POST /admin/matches/{id}/resolve, GET /admin/participants, PUT/GET /lineups/me, GET /me/squad.
3. Todas las validaciones en services: autenticado, participa, es su equipo, jugador de su club, partido ACTIVE, fecha activa, minuto válido. UPDATE condicional por estado.
4. Tests de API: el visitante no puede registrar eventos del local aunque manipule el request; el visitante no puede finalizar; el local no puede confirmar; no se activa la fecha 2 con partidos abiertos en la 1; reenviar el mismo evento no lo duplica.
Cierra con cerrar-fase (ficha docs/defense/match.md).
```

## Fase 6 – Realtime y WebSocket + bot visitante
```
Fase 6. Usa backend-fastapi. Tareas:
1. Listener con el cliente realtime asíncrono de Supabase (VERIFICA su API actual) suscrito a postgres_changes de matches y match_events, arrancado en el lifespan de FastAPI, con reconexión.
2. /ws con autenticación por primer mensaje y ConnectionManager. Traduce cambios a eventos tipados: MATCH_EVENT_CREATED, MATCH_RESULT_PENDING, MATCH_CONFIRMED, MATCH_DISPUTED, MATCH_RESOLVED, ROUND_ACTIVATED, STANDINGS_UPDATED, TOURNAMENT_STARTED. Envía solo a los participantes que correspondan.
3. scripts/demo/visitor_bot.py: inicia sesión como un participante, abre el WebSocket, y al recibir MATCH_RESULT_PENDING aprueba o rechaza según argumento (--approve / --reject). Así puedo probar el handshake con un solo teléfono.
4. scripts/demo/simulate_match.py: flujo completo por HTTP (activar fecha, eventos de ambos, finalizar) para el caso aprobado y el caso disputa + resolución admin.
5. docs/architecture/realtime.md: diagrama de secuencia Mermaid del handshake, qué pasa si el receptor está desconectado (la BD es la verdad; al reconectar se consulta por REST) y por qué usar Supabase Realtime en vez de emitir directamente tras la mutación.
Criterio: con dos terminales veo el evento llegar al bot en < 1 s. Cierra con cerrar-fase.
```

## Fase 7 – Despliegue del backend
```
Fase 7. Compara 2-3 hostings con plan gratuito que soporten FastAPI + WebSockets con HTTPS (VERIFICA límites actuales, si el servidor se duerme por inactividad y el tiempo de arranque). Recomiéndame uno y guíame paso a paso (yo creo la cuenta y pongo las variables de entorno en su panel; tú preparas los archivos de despliegue). Verifica /health y /ws por wss desde mi PC. Documenta en docs/architecture/deploy.md. Cierra con cerrar-fase.
```

## Fase 8 – App: base, auth, ruleta, home, tabla, calendario
```
Fase 8. Usa las skills mobile-expo y sistema-diseno. Tareas:
1. Tema y componentes base. Cliente API, sesión en SecureStore con restauración y refresh, TanStack Query con caché persistida, Zustand para sesión/conexión.
2. Pantallas: Login, Registro, Ruleta (pide asignación al backend, anima y se detiene en el club recibido; si ya tiene club, salta a Home), Home (mi club, próximo partido, posición, puntos, fecha actual, estado del torneo), Tabla (resaltar mi club), Calendario por fechas con estado de cada partido.
3. RealtimeService conectado al backend desplegado; banner de conexión.
4. ClubCrest y PlayerAvatar con imágenes reales desde /media del backend, caché en disco y fallback de iniciales.
Criterio: en Expo Go con mi Android, registro -> ruleta -> home funcionando contra el backend desplegado; con el modo avión activado veo la tabla y el calendario desde caché. Cierra con cerrar-fase.
```

## Fase 9 – Sala de partido horizontal + offline
```
Fase 9. Usa mobile-expo. Tareas:
1. Pantalla match/[id] en landscape: marcador, lista de eventos en vivo, TU EQUIPO vs OPONENTE, botones de evento solo para mi equipo (jugador + minuto), Finalizar (local), modal Confirmar/Rechazar (visitante).
2. Cola offline de eventos según CLAUDE.md, con contador de pendientes y envío automático al reconectar.
3. Prueba guiada: yo juego en el teléfono contra visitor_bot.py; caso aprobado y caso rechazado. Prueba offline: activo modo avión, registro 2 goles, desactivo, verifico que llegan una sola vez.
Cierra con cerrar-fase (incluye docs/defense/offline.md).
```

## Fase 10 – Pizarra táctica
```
Fase 10. Usa mobile-expo y sistema-diseno. Implementa la pizarra según la skill: campo en Skia, 11 fichas de mi plantilla, drag & drop con Gesture Handler + Reanimated, clamp con radio, coordenadas normalizadas, 4 formaciones, guardar/cargar con /lineups/me. Tests unitarios del helper de coordenadas y clamp. Mide FPS arrastrando fichas 30 s y completa docs/performance/tactical-board.md con dispositivo, escenario, herramienta y resultado real (si no llega a 60, dilo y propone causa). Cierra con cerrar-fase (docs/defense/canvas.md).
```

## Fase 11 – Admin en la app, prueba integral y defensa
```
Fase 11. Tareas:
1. Pantallas admin (visibles solo con rol admin): estado del torneo, participantes, iniciar torneo, activar siguiente fecha, partidos pendientes y disputas, resolver disputa.
2. scripts/demo/setup_demo.py: reinicia un torneo de demo con N participantes simulados listo para presentar.
3. Ejecuta todos los tests y una prueba manual completa; corrige errores reales.
4. Crea docs/defense/INDEX.md: arquitectura en 1 página, recorrido de un evento de punta a punta citando archivos, y las 20 preguntas más probables con respuesta corta.
5. README.md con cómo ejecutar todo en Windows y un aviso: escudos, nombres y datos pertenecen a sus titulares; uso académico no comercial; fuente de los datos.
Cierra con cerrar-fase.
```
