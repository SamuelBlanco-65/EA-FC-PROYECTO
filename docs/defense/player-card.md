# Defensa: estadísticas de jugador en la API y tarjeta (Fase 13, paso 3)

## Qué cambia y por dónde pasa
1. **Datos.** La tabla `players` ya tenía `pace, shooting, passing, dribbling, defending, physical` (migración `0009_players_face_stats.sql`, `smallint` con `CHECK` 1-99). No hay migración nueva.
2. **Backend.** Es un campo más en una ruta que ya existía, sin regla de negocio nueva:
   - `app/repositories/player_repository.py`: `COLUMNS` incluye las seis y `_player` las copia.
   - `app/domain/match.py::Player`: seis campos opcionales AL FINAL (`= None`), para no romper las construcciones posicionales.
   - `app/schemas/match.py::PlayerResponse`: los expone en camelCase (`pace`, `shooting`...). `GET /me/squad` es la única ruta que devuelve `PlayerResponse`.
3. **App.** `Player` (`src/api/types.ts`) los lleva como `number | null`; `CACHE_BUSTER` pasa de `v1` a `v2` para que una plantilla cacheada sin estadísticas no se muestre. La tarjeta es `src/features/squad/PlayerCard.tsx` (hoja inferior, no una ruta) y las etiquetas salen de la función pura `src/features/squad/stats.ts::statRows`.

## Decisiones
- **El backend guarda y entrega los datos tal como los dio la fuente; el significado lo elige quien dibuja.** En porteros las mismas seis columnas son estirada, paradas, saque, reflejos, velocidad y colocación (SoFIFA las reutiliza; `docs/scraping/scraping.md`). Alternativa descartada: que la API devuelva ya las etiquetas (`statLabels`): acopla el contrato a un detalle de presentación y duplica la tabla de etiquetas. Coste: la regla "GK cambia las etiquetas" vive en el cliente (con test).
- **`null`, no `0`, cuando falta un dato.** Un 0 se leería como una valoración real y pésima. Hay test (`test_missing_stats_are_null_not_zero`).
- **Campos planos y no un objeto `stats`.** Menos anidamiento y el `select` de PostgREST es una lista de columnas. Coste: seis campos más en `PlayerResponse`.
- **RLS sin cambios:** cualquier usuario autenticado ya podía leer `players` (comentario de `player_repository.py`).

## Preguntas probables
1. *¿Se ha tocado la seguridad?* No: misma ruta, mismo `get_current_user`, mismo cliente con el JWT del usuario; solo se leen columnas que ya eran legibles.
2. *¿Por qué `CACHE_BUSTER`?* La caché persistida de TanStack Query guarda `/me/squad` en disco; sin subirlo, un teléfono con la versión anterior mostraría jugadores sin estadísticas hasta que caduque.
3. *¿Y si falta un dato?* El campo llega `null` y la tarjeta enseña "–" y no dibuja la barra.
4. *¿Cómo sabes que las columnas llegan?* VERIFICADO (2026-10-05, solo lectura): `GET /me/squad` de un bot contra el Supabase real devolvió 28 jugadores con las seis estadísticas, todas entre 1 y 99; un portero con valores coherentes. Tests: `backend/tests/api/test_squad_endpoints.py` (herméticos).
5. Difícil: *¿Dónde se prueba que la RLS permite leer esas columnas?* En la BD real, no en los tests herméticos (los fakes no imitan la RLS): la comprobación de arriba lo cubre para un usuario participante.

## Errores típicos
- La app sigue sin mostrar estadísticas tras actualizar: el teléfono apunta a Render y el backend desplegado es el anterior (hay que redesplegar) o a un backend local sin reiniciar.
- Un `Player(...)` construido a mano en un test falla en `tsc`: el tipo ahora exige los seis campos (los helpers de `tactics.test.ts` y `squad.test.ts` los pasan en `null`).
