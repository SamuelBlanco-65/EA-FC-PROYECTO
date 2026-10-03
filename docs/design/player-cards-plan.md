# Nota de traspaso: pestaña Plantilla y tarjetas de jugador

Escrita el 2026-10-03 al cerrar la Fase 10, para continuar en otra sesión. No es una fase definida: el usuario decide si y cuándo se hace (`CLAUDE.md`: nada de features no pedidas).

## Estado en que se deja el proyecto
- Fase 10 (pizarra táctica) COMPLETA. Probada por el usuario en Expo Go: arrastre, guardar/cargar y **60 FPS estables** (resultado reportado por el usuario; no se anotaron mínimo, fotogramas lentos ni modelo del teléfono, ver `docs/performance/tactical-board.md`).
- Las fichas de la pizarra muestran la **foto del jugador** (`PlayerAvatar`, iniciales si no hay foto); el portero lleva borde dorado. Ya no se muestra el dorsal.
- La pizarra se abre desde Perfil -> "Pizarra táctica". La pestaña Plantilla NO existe todavía (el botón atrás de la pizarra dice "Perfil").

## Datos disponibles: VERIFICADO (consulta de solo lectura a la BD real, 2026-10-03)
- La tabla `players` tiene **677 jugadores**; los 677 tienen `overall_rating`.
- Los 677 tienen las **seis estadísticas de carta** rellenas: `pace`, `shooting`, `passing`, `dribbling`, `defending`, `physical` (migración `0009_players_face_stats.sql`, rango 1-99).
- Hay 595 jugadores de campo y **82 porteros**; los 82 también tienen las seis.
- **Porteros: las mismas seis columnas significan otra cosa** (SoFIFA las reutiliza): `pace` = diving, `shooting` = handling, `passing` = kicking, `dribbling` = reflexes, `defending` = speed, `physical` = positioning. La app debe mostrar esas etiquetas cuando `position = 'GK'` (ver `docs/scraping/scraping.md`). Comprobado con datos: Courtois (GK, 90) tiene 87/89/78/90/46/90, coherente con ese mapeo.
- Ejemplo de jugador de campo: Haaland (ST, 91) -> 87/92/71/80/47/89 (PAC/SHO/PAS/DRI/DEF/PHY).

## Lo que NO está hecho
- El backend **no expone** las estadísticas: `PlayerResponse` (`backend/app/schemas/match.py`) solo devuelve id, nombre, posición, overall, edad, nacionalidad, dorsal y foto. Tampoco están en `mobile/src/api/types.ts` (`Player`).
- No hay captura de diseño de la tarjeta individual. Sí existe `design/reference/11 · Plantilla.png` (lista de jugadores con foto, posición y chips de valoración de color) y `docs/design/screens.md` fila 11.
- `screens.md` fila 11 cita `GET /clubs/{club_id}` y `GET /clubs/{club_id}/players`. VERIFICAR que existen en el backend; hoy la app usa `GET /me/squad` (solo mi club).

## Idea propuesta (no decidida)
Estilo "carta de FIFA": al tocar un jugador (en la pizarra y en la futura pestaña Plantilla) se abre una tarjeta con overall y posición arriba, foto en el centro, nombre y las seis estadísticas abajo (etiquetas de portero si es GK). Reutilizable en Plantilla y Pizarra.

### Qué habría que hacer
1. Backend: añadir las seis estadísticas (y mapeo de etiquetas para GK, o un campo que indique cuáles son) a `PlayerResponse` y a la consulta del repositorio; tests en `backend/tests/api/`; desplegar en Render.
2. Mobile: ampliar `Player` en `types.ts` (y `CACHE_BUSTER` en `queryClient.ts` si cambia la forma cacheada del `/me/squad`); componente `PlayerCard`; tabla de etiquetas (campo vs portero) como función pura con tests, en `src/features/...`.
3. Pestaña `(tabs)/squad` (escudo del club, lista con foto/posición/overall, acceso a la Pizarra), según `11 · Plantilla.png`. Añadirla a `app/(tabs)/_layout.tsx` y cambiar el "Perfil" del botón atrás de la pizarra por "Plantilla".
4. Estilo: tokens de `docs/design/design-system.md`; tarjeta nueva, sin referencia visual (decidir con el usuario, idealmente con una captura de referencia).

### Costes y riesgos
- Cambio de contrato de API: se edita backend y `types.ts` a la vez; hay que redesplegar en Render.
- Alcance: es una feature no pedida originalmente; riesgo para "correcto y explicable antes que bonito". Se defiende bien como "un campo más en una API que ya existe, sin lógica de negocio nueva".
- Foto: algunas fotos pueden faltar; el fallback de iniciales ya existe.

## Primer paso recomendado para la próxima sesión
Pedir al usuario que defina la fase (Plantilla + tarjeta). Antes de implementar: comprobar si existen `GET /clubs/{id}/players` en el backend y decidir si la tarjeta lleva captura de referencia.
