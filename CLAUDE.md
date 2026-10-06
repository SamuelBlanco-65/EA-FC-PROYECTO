# EA FC Tournament – Companion App (parcial Desarrollo Móvil)

Proyecto académico individual. Entrega: 6 de octubre de 2026. Defensa oral individual centrada en el BACKEND.
Prioridad absoluta: correcto, estable y EXPLICABLE antes que grande o bonito. Nada de features no pedidas.

## Al iniciar CADA sesión
1. Lee `docs/PROGRESS.md` (estado real del proyecto; fases viejas en `docs/progress-archive.md`). Si no existe, estás en la Fase 0.
2. Comprueba la base: `git status` y, desde `backend/`, `.\venv\Scripts\python.exe -m pytest -m "not integration"`. Si falla algo que PROGRESS.md da por VERIFICADO, díselo al usuario antes de seguir.
3. Trabaja SOLO en la fase que te indique el usuario. Si dice "Fase N", la definición está en la sección "Fase N" de `PROMPTS.md`: léela de ahí (no dependas de un texto pegado en el chat, puede llegar cortado).
4. Al terminar la fase, usa la skill `cerrar-fase`. Ese cierre mueve a `docs/progress-archive.md` todo menos las 2 últimas fases de PROGRESS.md.

## Ramas y diseño vigente (actualizado 2026-10-05, tras las Fases 12 y 13)
- **Diseño vigente: v2** (dirección A, transmisión de TV): `docs/design/design-system-v2.md` (tokens, componentes, movimiento) y `docs/design/screens-v2.md` (plan por pantalla). Está implementado en `mobile/src/theme/` y `mobile/src/components/`. `docs/design/design-system.md` y `screens.md` son la v1 (historial). Los tokens v1 (`colors`, `type`, `shadows` en `tokens.ts`) siguen existiendo solo para la `Wheel` y `ClubCrest`: no los uses en pantallas nuevas.
- **Ramas:** `master` = app v1 probada (etiqueta `app-v1-estable`) + backend con las estadísticas de jugador, y es lo que despliega Render. `redesign-v2` (Fase 12) y `plantilla-detalle` (Fase 13, contiene todo lo anterior) están en GitHub SIN mezclar en `master`. Trabaja en `plantilla-detalle` salvo que el usuario diga otra cosa. No hagas merge a `master`, push de `master` ni redespliegues sin que el usuario lo pida expresamente: `master` es la versión defendible.
- Qué está hecho y qué falta probar en el teléfono: `docs/PROGRESS.md` (Fases 12 y 13).

## Peligros conocidos (aprendidos en fases anteriores)
- Los tests `-m integration` escriben en el Supabase REAL (el mismo de desarrollo). Deben borrar lo que crean en un `finally`, y cada paso del borrado independiente: si uno falla, los demás deben seguir. Antes de dar una fase por cerrada, comprueba 0 torneos y 0 usuarios `it-*` huérfanos.
- "Torneo actual" = el creado más recientemente. Un torneo de prueba huérfano cambia el comportamiento de TODOS los endpoints siguientes.
- Borrar un torneo que ya tiene eventos falla: `match_events.participant_id` no tiene `ON DELETE CASCADE`. Borra primero los `match_events` de sus partidos.
- El `Torneo de prueba` de la BD real YA ESTÁ INICIADO (ACTIVE, desde la Fase 9): usuario del teléfono "d" (Bayern) + bots participant02/03, calendario de 6 fechas con partidos ya jugados. No hay endpoint para crear/reiniciar torneos; reiniciarlo es por SQL y lo decide el usuario. Los tests de integración deben seguir creando su propio torneo y borrándolo (ver arriba), sin tocar este. Pregunta al usuario antes de borrarlo o de asumir que está en DRAFT.
- Los flujos autenticados se prueban con el TestClient de FastAPI, no con uvicorn: no digas "probado con uvicorn" salvo que se haya hecho.
- Los fakes de `backend/tests/api/fake_world.py` NO imitan la RLS; lo que decide Postgres se prueba en `tests/integration/`.

## Arquitectura (regla del profesor: el frontend NUNCA habla con la base de datos)
```
App móvil (Expo, TS) --HTTPS REST + WSS--> Backend propio (Python, FastAPI) --supabase-py / Postgres--> Supabase
                                                    ^                                                     |
                                                    +---- Supabase Realtime (postgres_changes) -----------+
```
- La app NO contiene ninguna clave de Supabase ni importa `@supabase/supabase-js`. Solo conoce `EXPO_PUBLIC_API_URL`.
- Flujo realtime: cambio en BD -> Supabase Realtime -> listener del backend -> backend decide destinatarios -> WebSocket propio -> app.
- La BD es la fuente de verdad. El WebSocket solo NOTIFICA; al reconectar, la app vuelve a pedir el estado por REST.

## Stack (cerrado)
- Backend: Python 3, FastAPI, Pydantic, supabase-py, cliente `realtime` asíncrono de Supabase, pytest. Venv + pip.
- Scraper/seed: Python, requests + BeautifulSoup. Selenium SOLO si la fuente carga datos con JavaScript.
- Mobile: Expo + TypeScript + Expo Router, TanStack Query (server state), Zustand (UI/cliente), Skia + Reanimated + Gesture Handler (pizarra), expo-secure-store, expo-screen-orientation.
- Ejecución: Expo Go en Android 14 físico. NO Android Studio, NO development build salvo que una librería obligatoria no esté en Expo Go (avisar antes).
- iOS: compatible en el código, sin pruebas (no hay iPhone). No invertir tiempo en iOS.
- Desarrollo en Windows (PowerShell). Comandos compatibles con Windows.

## Estructura
```
backend/      app/{api,core,domain,repositories,services,realtime,schemas}/ tests/
scraper/      sources/ parsers/ normalize.py validate.py seed.py  data/{raw,normalized}/
mobile/       app/ (Expo Router)  src/{api,features,stores,realtime,offline,theme,components}/
supabase/     migrations/*.sql
scripts/      db/apply_migrations.py  demo/
config/       tournament-clubs.json
docs/         PROGRESS.md VERSIONES.md defense/ architecture/
```
Capas del backend: router (HTTP) -> service (reglas de negocio) -> domain (funciones puras: calendario, tabla, máquina de estados) -> repository (Supabase). Ningún router accede a Supabase directamente.

## Reglas de negocio (cerradas)
- 5 ligas (Premier, LaLiga, Serie A, Bundesliga, Ligue 1) x top 5 = 25 clubes. Top 5 = clasificación final temporada 2025-26, guardada en `config/tournament-clubs.json` (editable sin tocar código).
- Máx. 25 participantes. Un club por participante, sin repetición: `UNIQUE(tournament_id, club_id)` y `UNIQUE(tournament_id, user_id)`.
- El SERVIDOR asigna el club al azar en una función SQL atómica (reintento ante unique_violation). La ruleta solo anima el resultado. La app nunca envía clubId.
- Inscripción cerrada cuando el torneo inicia. Iniciar exige >= 2 participantes.
- Calendario: round robin por método del círculo, ida y vuelta (vuelta = ida con local/visitante invertidos). N impar -> descanso (BYE, sin fila de partido). Rondas = 2*(N-1) si N par, 2*N si impar. Partidos = N*(N-1).
- Fechas: el admin activa la siguiente solo si TODOS los partidos de la actual están CONFIRMED o RESOLVED. Al activarla, sus partidos pasan a ACTIVE.
- Estados de partido: SCHEDULED -> ACTIVE -> PENDING_CONFIRMATION -> CONFIRMED | DISPUTED -> RESOLVED. El admin también puede resolver uno PENDING_CONFIRMATION (visitante que no responde). Cualquier otra transición se rechaza.
- Transiciones con UPDATE condicional (`WHERE id = ? AND status = <estado esperado>`); si afecta 0 filas -> 409.
- Eventos: GOAL, YELLOW, RED. Campos: id (UUID generado por el cliente), match_id, participant_id, player_id, type, minute (1-120). Solo del equipo propio (player_id debe pertenecer al club del participante) y solo con partido ACTIVE en la fecha activa. Sin borrado en el MVP (errores -> disputa).
- Marcador: se DERIVA de los eventos GOAL. "Finalizar" (solo local) no recibe marcador: lo calcula el servidor y lo guarda en home_score/away_score.
- Visitante aprueba -> CONFIRMED; rechaza -> DISPUTED. En disputa, el admin fija el marcador oficial (+ nota) -> RESOLVED.
- Tabla: solo partidos CONFIRMED/RESOLVED. 3/1/0. Orden: PTS, DG, GF, nombre del club. Se calcula (vista SQL o función de dominio), nunca se mantiene a mano.
- Tarjetas = solo estadística, sin sanciones.
- Escudos y fotos REALES obtenidos por scraping, guardados en Supabase Storage (bucket privado) y servidos por el backend en `/media/...`. Uso académico, no comercial; README con aviso de propiedad de marcas y fuente de los datos.

## Offline (debe funcionar de verdad, alcance acotado)
- Lectura: caché persistida de TanStack Query (tabla, calendario, club, plantilla, partido).
- Escritura: eventos de partido en cola persistente local con UUID del cliente; se envían en orden al reconectar. El servidor hace INSERT ... ON CONFLICT (id) DO NOTHING -> reenviar es idempotente.
- Finalizar, confirmar, rechazar, ruleta, alineación y acciones admin: SOLO online. "Finalizar" bloqueado mientras la cola tenga pendientes.
- No hay conflictos entre usuarios porque cada uno solo escribe eventos de su propio equipo.

## Seguridad
- Auth: Supabase Auth detrás del backend. La app recibe access/refresh token del backend y los guarda en SecureStore.
- El backend valida el JWT en cada request y obtiene user_id y rol de `profiles` (nunca del cliente).
- Operaciones de participante: cliente Supabase con el JWT del usuario (RLS aplica). Admin, seed, asignación atómica y listener realtime: clave secreta, SOLO en el backend.
- RLS activado en TODAS las tablas. Ninguna política para `anon`.
- Secretos solo en `backend/.env` (ignorado por git). Nunca en logs, nunca en mobile.
- Errores API: `{"error": {"code": "MATCH_NOT_ACTIVE", "message": "...", "details": {}}}` con códigos estables.

## Honestidad técnica (obligatorio)
- No inventes funciones, métodos, opciones ni endpoints de librerías. Si dudas, consulta la documentación oficial actual o di "VERIFICAR".
- Marca cada afirmación de estado como VERIFICADO / NO PROBADO / PENDIENTE. Nunca digas "funciona" sin haberlo ejecutado.
- No afirmes que un sitio permite scraping sin revisar su robots.txt y términos; si no queda claro, pregunta al usuario.
- Antes de instalar un paquete en mobile: usa `npx expo install` y comprueba que funciona en Expo Go.

## Estilo
- Código, nombres y commits en inglés. Interfaz de la app, documentación y explicaciones en español.
- Explicaciones cortas y ligadas al código real (qué, por qué, alternativa descartada).
- Un commit por fase terminada.

## Skills del proyecto
- `backend-fastapi`: convenciones del backend Python.
- `supabase-sql`: migraciones, RLS y funciones SQL.
- `mobile-expo`: convenciones de la app.
- `cerrar-fase`: reporte, PROGRESS.md y ficha de defensa.
