# Scraping y seed (Fase 3)

Origen de los datos de `clubs` y `players`: páginas de equipo de SoFIFA (EA FC 27, plantillas del 1 oct 2026) guardadas a mano, procesadas sin conexión.

## Fuente y por qué así
- **Elegida:** SoFIFA, páginas de equipo guardadas por el usuario con Ctrl+S ("Página web, completa"), una por club, en `scraper/data/raw/sofifa/<liga>_<posición>_<club>/`. El código las lee del disco; **no hace ninguna petición de red**.
- **Por qué no scraping automático:** SoFIFA está detrás de Cloudflare; su `robots.txt` y el de su CDN devolvieron 403 y no pudieron leerse. Los términos de uso (pegados por el usuario) no prohíben ni autorizan expresamente el acceso automatizado, y se reservan bloquear IP. Como no queda claro, no se automatiza ni se intenta sortear Cloudflare.
- **Descartadas:** Transfermarkt (términos prohíben bots), EA (su `robots.txt` prohíbe scraping/minería), Bundesliga/DFL (robots prohíben bots), football-data.org y TheSportsDB (planes gratuitos sin plantillas / demasiado limitados).
- **Consecuencia sobre el encargo:** requests, pausas entre peticiones y User-Agent identificable **no aplican** (no hay red). La interfaz `ScrapingSource` permite añadir una fuente HTTP más adelante sin tocar parser, normalización ni seed.

## Clubes
`config/tournament-clubs.json`: top 5 de la clasificación final 2025-26 de Premier, LaLiga, Serie A, Bundesliga y Ligue 1 (Wikipedia; fecha de consulta y criterio dentro del JSON). Verificación cruzada completa en Premier, LaLiga y Serie A; parcial en Bundesliga y Ligue 1 (campeones confirmados con otras fuentes). Marseille 5º vs Rennes 6º: 59 puntos ambos, desempate por diferencia de goles (+18 / +9). Editable sin tocar código.

## Pipeline
```
raw (HTML guardado) -> parsers/sofifa_team.py -> normalize.py -> validate.py -> data/normalized/<club>.json (+ media PNG) -> seed.py -> Supabase
```
- `sources/base.py` (`ScrapingSource`), `sources/sofifa_saved.py` (lee la carpeta del club).
- `parsers/sofifa_team.py`: función pura HTML -> datos. Las columnas se leen por `data-col` (`ae`, `oa`, `pac`, `sho`, `pas`, `dri`, `def`, `phy`); el dorsal, de la columna "Team & Contract" localizada por su cabecera. La primera tabla es la plantilla; las siguientes son cedidos. El escudo es la imagen `meta/team` dentro de `.profile`.
- `media.py`: copia las imágenes originales a `data/raw/media/` y las normaliza a PNG en `data/normalized/media/`. No se amplían nunca (las fotos de jugador son 60x60 px; solo hay 120/180 px en el CDN, que no se accede).
- `seed.py`: sube PNG al bucket privado `media` (`crests/<id>.png`, `players/<id>.png`, `upsert`) y hace `upsert` por `external_source_id`. Guarda en BD solo la ruta (`crest_path`, `photo_path`). Imagen faltante = `NULL` + aviso, nunca inventada.

## Campos guardados (13)
`name`, `position`, `overall_rating`, `age`, `nationality`, `shirt_number`, `photo_path` y las seis de carta: `pace`, `shooting`, `passing`, `dribbling`, `defending`, `physical` (migración `0009`).
- **Porteros:** SoFIFA reutiliza esas seis columnas con otro significado: pace = diving, shooting = handling, passing = kicking, dribbling = reflexes, defending = speed, physical = positioning. La app debe mostrar las etiquetas de portero cuando `position = 'GK'`.
- `position` es solo la **primera** posición de la página (la principal). Las secundarias no se guardan.
- `name` es el nombre completo de la ficha (atributo `data-tippy-content`), no el abreviado.
- Colores del club (`primary_color`, `secondary_color`): la fuente no los da, quedan `NULL`.

## Validación
Se rechaza un jugador solo si falta un campo NOT NULL (nombre, posición) o está cedido (`LOANED_OUT`). Un valor opcional fuera de rango se guarda `NULL` con aviso (nunca se recorta). La página debe traer todas las columnas requeridas, o el club da `MISSING_COLUMN`.

## Resultado de la ejecución real (25 clubes) — VERIFICADO
| | |
|---|---|
| Clubes procesados / escudos | 25 / 25 |
| Jugadores encontrados / válidos / rechazados | 863 / 677 / 186 (todos `LOANED_OUT`) |
| Fotos subidas / faltantes | 663 / 14 (placeholder de SoFIFA, queda `NULL`) |
| `overall_rating` NULL | 0 (la fuente lo da) |
| Avisos | 14 `PHOTO_IMAGE_PLACEHOLDER`, 10 `CLUB_NAME_MISMATCH` |
| Objetos en el bucket `media` | 688 (25 + 663) |

`CLUB_NAME_MISMATCH`: el nombre de la página difiere del de la configuración (p. ej. "FC Bayern München" / "Bayern Munich"). Revisados: los 10 son el mismo club; manda el nombre de la configuración.

**Idempotencia:** `seed.py` ejecutado dos veces deja 25 clubes, 677 jugadores y 688 objetos; el hash de todos los UUID es idéntico antes y después. Un jugador que desaparezca de la fuente en una carga posterior **no se borra** de la BD.

## Cómo repetirlo (PowerShell, desde la raíz)
```
.\backend\venv\Scripts\python.exe -m scraper.pipeline            # o: --only "Arsenal"
.\backend\venv\Scripts\python.exe -m scraper.seed                # o: --only "Arsenal"
.\backend\venv\Scripts\python.exe -m pytest scraper\tests
```
`--only` compara el nombre completo o el código del club (no un fragmento).
Para otro club: guardar la página con las 12 columnas visibles (Age, Overall rating, Potential, Wage, Value, Total stats, PAC, SHO, PAS, DRI, DEF, PHY), bajando hasta el final antes de Ctrl+S.

## Aviso legal
Uso académico, no comercial. Escudos, nombres de clubes y jugadores, fotos y valoraciones pertenecen a sus propietarios (clubes, ligas, EA). Fuente de los datos: SoFIFA; clasificaciones: Wikipedia. El contenido descargado no se versiona (`scraper/data/raw/` y `scraper/data/normalized/media/` están en `.gitignore`).
