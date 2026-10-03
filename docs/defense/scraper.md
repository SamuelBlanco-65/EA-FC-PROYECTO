# Defensa: scraper y seed (Fase 3)

## Qué hace y flujo
1. `config/tournament-clubs.json` fija los 25 clubes (top 5 de 5 ligas, 2025-26).
2. El usuario guarda la página SoFIFA de cada club en `scraper/data/raw/sofifa/<club>/` (sin red).
3. `sources/sofifa_saved.py` entrega el HTML -> `parsers/sofifa_team.py` (función pura) extrae jugadores -> `normalize.py` da forma de tabla -> `validate.py` rechaza/avisa -> `media.py` normaliza imágenes a PNG -> `pipeline.py` escribe `data/normalized/*.json` y `report.json`.
4. `seed.py` sube los PNG al bucket privado `media` y hace `upsert` por `external_source_id` en `clubs` y `players` con la clave secreta (solo backend).
5. La app nunca ve Supabase: el backend servirá las imágenes por `/media`.

## Decisiones
- **HTML guardado a mano en vez de scraping automático.** SoFIFA usa Cloudflare, su `robots.txt` dio 403 y sus términos no aclaran el acceso automatizado. Descartado: Playwright con reintentos/sigilo (sería sortear una protección). Coste: 25 guardados manuales; ventaja: cero riesgo legal/técnico y reproducible.
- **`upsert` por `external_source_id` (UNIQUE) y `upsert` de Storage.** Ejecutar el seed dos veces no duplica. Descartado: borrar y reinsertar (cambiaría los UUID que referencian otras tablas). Coste: un jugador que desaparece de la fuente no se borra.
- **Parser puro, columnas por `data-col`, no por posición.** Testeable con HTML sintético y robusto si cambia el orden de columnas. Coste: si SoFIFA renombra `data-col`, el pipeline lo avisa con `MISSING_COLUMN`.

## Preguntas probables
1. *¿Por qué no scrapeaste la web directamente?* Cloudflare + robots ilegible + términos no concluyentes; automatizarlo implicaría sortear la protección. Guardado manual y parseo local.
2. *¿Cómo garantizas que no se duplican datos?* `UNIQUE(external_source_id)` + `upsert on_conflict`; verificado: dos ejecuciones, mismos 25/677/688 y mismo hash de UUID.
3. *¿Qué pasa con una imagen que falta?* `NULL` + aviso en el resumen; nunca se inventa. Hubo 14 placeholders de SoFIFA.
4. *¿Por qué las fotos son pequeñas?* La página guarda 60x60 px; las mayores solo están en el CDN, que no se consulta. No se amplían.
5. *Difícil: ¿y si el overall de un jugador cambia después de sembrar?* Volver a guardar la página y ejecutar pipeline + seed lo actualiza (`upsert`). Lo que no hace el seed es borrar jugadores que ya no están; haría falta una pasada de limpieza explícita.

## Errores típicos
- `MISSING_COLUMN`: la página se guardó sin alguna de las 12 columnas -> volver a guardarla.
- `PAGE_NOT_FOUND`: carpeta vacía o con más de un `.html`.
- Error real que ocurrió: el overall salía NULL cuando la celda traía un cambio (`77` + `+1`); corregido leyendo solo el `<em>`, con test.
- Porteros: las 6 estadísticas significan otra cosa (diving, handling…); la app lo debe etiquetar por `position`.
