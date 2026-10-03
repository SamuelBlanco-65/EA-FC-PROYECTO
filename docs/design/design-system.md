# Sistema de diseño – "FC ARENA"

Fuente: las 19 imágenes de `design/reference/` (leídas una sola vez en la Fase 0).

**Cómo leer los valores.** Son ESTIMADOS a partir de la inspección visual de las capturas, no muestreados por píxel. Las capturas portrait miden 780 px de ancho = 390 dp (escala 2x). Las landscape miden 1830 px = 915 dp. Todos los valores van en dp. Antes de la Fase 8, validar los hex con un muestreador de píxeles y, si difieren, corregir solo `src/theme/tokens.ts`.

Marca visible en la app: **FC ARENA**, lema "TU TORNEO PRIVADO ENTRE AMIGOS". El nombre técnico del proyecto sigue siendo "EA FC Tournament".

## 1. Paleta (modo oscuro único)

| Token | Hex (estimado) | Uso |
|---|---|---|
| `bg` | `#0A0E1A` | Fondo de pantalla |
| `bgGlowGreen` | `#00E58D` al 12 % | Brillo radial esquina sup. derecha (login, ruleta resultado) |
| `bgGlowBlue` | `#3B6CF0` al 14 % | Brillo radial (registro, Inicio) |
| `bgGlowRed` | `#FF4D5E` al 10 % | Brillo radial en error y disputa |
| `surface` | `#141A2E` | Tarjetas, inputs, filas de tabla |
| `surfaceRaised` | `#1B2340` | Tarjetas destacadas, paneles, modales |
| `surfaceSunken` | `#070A14` | Marcador (dígitos), campo de nota, fondo de segmentos |
| `border` | `#2A3150` | Borde de tarjetas e inputs (1 dp) |
| `borderDashed` | `#5A6285` | Placeholders de escudo y foto (1,5 dp, discontinuo) |
| `textPrimary` | `#F2F4FF` | Títulos, valores |
| `textSecondary` | `#8B93B0` | Subtítulos, etiquetas, texto de ayuda |
| `textOnAccent` | `#04120C` | Texto sobre botón verde o blanco |
| `accent` | `#00E58D` | Acción principal, activo, "TU EQUIPO", marcas de sección |
| `accentGradientTop` | `#2BFFA0` | Degradado botón primario (arriba) |
| `accentGradientBottom` | `#00D984` | Degradado botón primario (abajo) |
| `accentSoft` | `#00E58D` al 14 % | Fondo de pastilla activa, badge "En juego" |
| `info` | `#3B6CF0` | Marca de sección azul, "Confirmado", puntos de timeline |
| `infoSoft` | `#3B6CF0` al 22 % | Fondo badge "Confirmado" y rol |
| `infoText` | `#8FA8FF` | Texto de badge azul |
| `warning` | `#F5C230` | Pendiente, tarjeta amarilla, banner sin conexión |
| `warningSoft` | `#F5C230` al 16 % | Fondo badge "Pendiente" |
| `danger` | `#FF4D5E` | Error, disputa, tarjeta roja, Rechazar, Cerrar sesión |
| `dangerSoft` | `#FF4D5E` al 14 % | Fondo badge "En disputa", banner de error |
| `onWhite` | `#FFFFFF` | Botón "Finalizar partido" |
| `pitch` | `#1B6B3A` / `#1F7A42` | Campo de la pizarra (franjas alternas) |
| `pitchLine` | `#FFFFFF` al 55 % | Líneas del campo |

Colores por liga (ruleta y leyenda): LaLiga `#1F8F5A`, Premier League `#3B6CF0`, Bundesliga `#D4A52A`, Serie A `#C93A4A`, Ligue 1 `#7C5CD6`.

Color de valoración de jugador (chip): `>= 85` verde con degradado de `accent`; `80–84` azul `#3B6CF0` con texto oscuro; menor, fondo `surface` con borde `border`. Los umbrales 85 y 80 se infieren de las capturas (87, 86, 85, 88 = verde; 84, 83, 81 = azul; 74 = sin color). El límite exacto entre azul y neutro NO se ve en las capturas: DECIDIR.

## 2. Tipografía

Dos familias, ambas deducidas visualmente (VERIFICAR contra Google Fonts antes de instalar):

- **Display**: sans condensada, itálica, muy gruesa, siempre MAYÚSCULAS. Candidata: Barlow Condensed (700 o 800 italic).
- **Texto**: sans humanista semi-condensada. Candidata: Barlow (400, 500, 600, 700).

Para cargarlas haría falta `expo-font` y `@expo-google-fonts/<familia>`. `expo-font` se retiró del scaffold en la Fase 0 porque nada lo usa todavía: añadirlo con `npx expo install expo-font` en la fase de tema.

| Estilo | Familia | Tamaño / interlineado | Peso | Extra |
|---|---|---|---|---|
| `titleScreen` | Display italic | 32 / 34 | 800 | MAYÚSCULAS |
| `titleHero` (login, ruleta) | Display italic | 36 / 38 | 800 | MAYÚSCULAS |
| `titleCard` (nombre de club) | Display italic | 28 / 30 | 800 | MAYÚSCULAS |
| `scoreDigit` | Display | 44 / 46 | 800 | números tabulares |
| `scoreDigitSmall` (calendario) | Display | 28 / 30 | 800 | |
| `statValue` (Posición, Puntos…) | Display italic | 32 / 34 | 800 | |
| `eyebrow` | Texto | 12 / 16 | 700 | MAYÚSCULAS, `letterSpacing` 2 |
| `label` (campo) | Texto | 15 / 20 | 600 | `textPrimary` |
| `body` | Texto | 16 / 22 | 400 | `textSecondary` por defecto |
| `bodyStrong` | Texto | 16 / 22 | 600 | |
| `caption` | Texto | 13 / 18 | 400 | `textSecondary` |
| `badge` | Texto | 13 / 16 | 700 | |
| `button` | Display italic | 20 / 24 | 800 | MAYÚSCULAS, `letterSpacing` 0,5 |
| `tabLabel` | Texto | 12 / 16 | 600 | |
| `tableCell` | Display | 17 / 20 | 700 | tabulares |

## 3. Espaciado y retícula

- Escala base: 4 dp → `4, 8, 12, 16, 20, 24, 32, 40`.
- Margen lateral de pantalla: **16 dp** (portrait). En landscape (sala): 16 dp y 12 dp entre paneles.
- Separación vertical entre tarjetas: 12 dp. Padding interno de tarjeta: 16 dp (20 dp en tarjeta de resultado de ruleta).
- Separación etiqueta → campo: 8 dp. Entre campos: 16 dp. Texto de ayuda o error bajo campo: 6 dp.
- Barra de pestañas: alto 72 dp + inset inferior del sistema.

## 4. Radios y bordes

| Elemento | Radio | Borde |
|---|---|---|
| Tarjeta / panel | 20 | 1 dp `border` |
| Modal | 24 | 1 dp `border` + línea superior de 2 dp de color de estado |
| Input | 14 | 1 dp `border`; foco 1,5 dp `accent`; error 1,5 dp `danger` |
| Botón principal / secundario | 18 | sin borde (secundario: 1 dp `border`) |
| Chip de fecha, pestaña de formación | 14 | 1 dp |
| Badge de estado | 10 | sin borde |
| Marcador (cada dígito) | 12 | 1 dp `border` |
| Placeholder de escudo | 14 | 1,5 dp `borderDashed` discontinuo |
| Placeholder de foto | circular | 1,5 dp `borderDashed` discontinuo |
| Ficha de pizarra | circular, Ø 44 | 2 dp blanco |
| Avatar de perfil | circular, Ø 104 | 3 dp degradado `accent` → `info` |

Detalle de estilo: pestañas activas, badges de la barra y chips de formación usan forma de **paralelogramo inclinado** (skewX ≈ -10°). En React Native se logra con `transform: [{ skewX: '-10deg' }]` en el contenedor y contra-inclinando el contenido. VERIFICAR rendimiento y nitidez en Android antes de adoptarlo; alternativa descartable: rectángulo con radio normal.

## 5. Sombras y brillos

Los brillos son de color, no grises:

| Token | Valor |
|---|---|
| `glowAccent` | `shadowColor #00E58D`, opacidad 0,35, radio 24, offset y 8 (botón primario, campo con foco, tarjeta "TU PARTIDO") |
| `glowDanger` | `shadowColor #FF4D5E`, opacidad 0,30, radio 20 (banner de error, botón Rechazar) |
| `glowToken` | `shadowColor #00E58D`, opacidad 0,5, radio 16 (ficha arrastrada) |
| `cardShadow` | negra, opacidad 0,35, radio 16, offset y 6 |

Aviso técnico: en Android el color de sombra (`shadowColor`) solo se respeta con `elevation` y desde API 28; Android 14 lo cumple. El resultado visual es NO PROBADO. Alternativa si no se ve: dibujar el brillo con Skia o un `LinearGradient`/capa traslúcida bajo el elemento.

## 6. Fondo

- Color base `bg` + rayas diagonales a 20° (líneas de 1 dp, `#FFFFFF` al 3 %, separadas ≈ 36 dp) + un brillo radial de color según contexto. Es decorativo: implementarlo una sola vez como componente `ScreenBackground` (Skia o `expo-linear-gradient` + `View`).
- La Sala en vivo usa el mismo fondo en landscape.

## 7. Componentes

**Tarjeta.** `surface`, radio 20, borde 1 dp `border`, padding 16. Variante *destacada*: `surfaceRaised` + franja diagonal verde translúcida a la derecha (Mi club, Club asignado). Variante *TU PARTIDO / TU EQUIPO*: borde `accent` de 1,5 dp + `glowAccent`. Variante *error / disputa*: borde `danger` + fondo `dangerSoft`. Variante *vacía / descanso*: borde discontinuo `borderDashed`, sin relleno.

**Etiqueta de sección (eyebrow).** Barra de 16 × 4 dp, radio 2, color `accent` (o `info`, o `danger` según el contexto) + texto `eyebrow` a 8 dp.

**Botón primario.** Alto 60, radio 18, degradado vertical `accentGradientTop → accentGradientBottom`, texto `button` en `textOnAccent`, icono opcional a la izquierda o derecha, `glowAccent`. Deshabilitado/cargando: fondo `#0F7A4A` al 80 %, texto `textPrimary` al 80 %, spinner de 20 dp a la izquierda.
**Botón secundario.** Alto 56, `surface`, borde `border`, texto `textPrimary`.
**Botón peligro.** Relleno degradado `#FF6B78 → #F23A4D` con texto `textOnAccent` (Rechazar) o contorno `danger` con fondo `dangerSoft` y texto `danger` (Cerrar sesión).
**Botón "Finalizar partido".** Fondo `onWhite`, texto `textOnAccent`, alto 52. Deshabilitado: `surface` con candado y texto `textSecondary`.
**Botón enlace.** Texto `accent`, peso 600, sin fondo.
**Botones de evento (sala).** Tres teclas de 74 × 92 dp, radio 18: Gol (relleno verde, balón), Amarilla (fondo `warningSoft`, borde `warning`, icono tarjeta), Roja (fondo `dangerSoft`, borde `danger`).

**Input.** Alto 56, radio 14, fondo `surface`, icono a la izquierda de 20 dp en `textSecondary`, texto `body` en `textPrimary`. Contraseña: botón "Mostrar" a la derecha (alto 44, radio 12, fondo `surfaceRaised`, icono ojo). Válido: check verde a la derecha. Error: borde `danger`, icono de alerta a la derecha y mensaje `caption` en `danger` debajo.
**Medidor de contraseña.** 4 segmentos de alto 4 dp (activos `accent`, inactivos `border`) + etiqueta a la derecha ("Segura").

**Badges de estado de partido** (alto 28, radio 10, icono de 14 dp + texto `badge`):

| Estado (código) | Texto en la app | Icono | Fondo | Texto/icono |
|---|---|---|---|---|
| `SCHEDULED` | Programado | cuadrado con línea | `surface` + borde | `textSecondary` |
| `ACTIVE` | En juego | punto lleno | `accentSoft` | `accent` |
| `PENDING_CONFIRMATION` | Pendiente de confirmación (corto: Pendiente) | reloj | `warningSoft` | `warning` |
| `CONFIRMED` | Confirmado | check | `infoSoft` | `infoText` |
| `DISPUTED` | En disputa | triángulo de alerta | `dangerSoft` | `danger` |
| `RESOLVED` | Resuelto | escudo con check | `surfaceRaised` | `textPrimary` |

Otros badges: **EN VIVO** (sala): relleno `danger`, punto negro, texto `textOnAccent`. **Conectado**: pill `accentSoft` + borde `accent`, icono wifi. **Sin conexión**: pill `warningSoft` + borde `warning`, icono wifi tachado. **En línea** (Inicio): igual que Conectado. **Rol**: `infoSoft` + icono usuario. **Solo admin**: `infoSoft` + icono escudo. **Solo lectura**: `surface` + candado. **TU EQUIPO / OPONENTE** en eventos: texto `eyebrow` en `accent` / `textSecondary`.

**Banner sin conexión.** Ancho completo, alto 56, fondo `warning` con rayas diagonales oscuras al 12 %, texto `textOnAccent` 700, icono wifi tachado. En sala: texto "Sin conexión – N eventos pendientes de enviar". En Inicio: "Sin conexión / Mostrando datos guardados" + botón "Reintentar" (contorno oscuro).

**Marcador.** Dos cajas `surfaceSunken` de 46 × 52 (portrait grande 56 × 64) con `scoreDigit`; separadas 8 dp. En sala landscape se separa con ":" y no hay borde de color. El dígito del equipo que va ganando puede ir en `accent` (visto en Detalle de partido: 3 verde, 1 blanco).

**Fila de tabla.** Alto 56, radio 12, fondo `surface`; fila propia con borde `accent` 1,5 dp + fondo `accentSoft` + etiqueta "TU CLUB" en `eyebrow` verde. Cabecera: `eyebrow`. DG positiva `accent`, negativa `danger`, cero `textSecondary`. PTS en `tableCell` 20 px, blanco, más grueso. Nombre de club truncado con elipsis.

**Fila de evento (sala/detalle).** Chip de minuto (paralelogramo, borde `info`, texto display) + icono (balón = círculo con pentágono, rectángulo amarillo, rectángulo rojo) + nombre de jugador. Pendiente de envío: badge `warning` "Pendiente" al lado.

**Timeline (detalle de partido).** Línea vertical central de 2 dp `info`; chips de minuto sobre la línea; eventos del local a la izquierda y del visitante a la derecha en píldoras `surface`; leyenda Gol / Amarilla / Roja abajo.

**Barra de progreso de fechas (Inicio).** N segmentos de alto 8, radio 4, separación 6: completados `accent` con brillo, actual rayado verde, pendientes `border`.

**Estados comunes** (ver `screens.md`): esqueleto = bloques `surface` con degradado animado hacia `surfaceRaised`; vacío = ilustración de portería con balón verde (bloque de 160 dp) + título display + texto + botón secundario; error = círculo `danger` de 96 dp con triángulo + título + texto + botón primario "REINTENTAR".

## 8. Iconografía

- Estilo: contorno de 2 dp, extremos redondeados, 24 dp en barra y 20 dp en campos. Parece de la familia Lucide/Feather. Propuesta: `@expo/vector-icons` (Feather o Ionicons, ya incluido en Expo Go; VERIFICAR que `@expo/vector-icons` sigue disponible en el SDK 57 al instalarlo).
- Iconos usados: casa, tabla/cuadrícula, calendario, camiseta, usuario (barra); sobre, candado, ojo (campos); flecha atrás (chevron-left), chevron-right; wifi y wifi tachado; reloj; check; X; triángulo de alerta; escudo con check; bandera (finalizar); disco (guardar); girar (refresh); salida (log-out); balón (círculo con pentágono, icono propio con Skia o SVG); tarjeta amarilla y roja (rectángulos redondeados).
- Logo: cuadrado verde inclinado (paralelogramo, radio 14, degradado `accent`) con "FC" en negro, seguido de "ARENA" blanco con subrayado de degradado `accent → info`.

## 9. Navegación

- **Pestañas inferiores (5)**: Inicio, Tabla, Calendario, Plantilla, Perfil. Alto 72 dp, fondo `bg` con borde superior 1 dp `border`. Activa: icono y texto `accent`, pastilla inclinada `accentSoft` detrás del icono y una barra superior de 3 dp × 40 dp `accent` sobre la pestaña. Inactiva: `textSecondary`.
- **Pantallas con botón atrás** (texto + chevron arriba a la izquierda, sin barra de título): Registro ("Volver"), Detalle de partido ("Calendario"), Pizarra ("Plantilla"), Administración ("Perfil"), Resolver disputa ("Administración").
- **Sala en vivo**: pantalla completa horizontal, sin pestañas. "Salir" arriba a la izquierda.
- **Ruleta**: pantalla completa sin pestañas, solo avanza (Girar → resultado → Comenzar → Inicio). Sin botón atrás.
- **Modales**: registrar evento (landscape, tarjeta centrada de unos 620 dp de ancho) y confirmar resultado (landscape, ≈ 520 dp). Fondo con oscurecimiento al 70 %.
- Se mantienen las rutas de la skill `mobile-expo`: `(auth)`, `roulette`, `(tabs)`, `match/[id]`, `tactics`, `admin/*`.

## 10. Movimiento (observado en estados, no animado en las capturas)

Marcado como PENDIENTE de decidir en Fase 8. Candidatos coherentes con las capturas: giro de ruleta con desaceleración (Reanimated sobre Skia), confeti en el resultado, ficha de pizarra con escala 1,15 al arrastrar, brillo pulsante en "En juego", esqueleto con barrido.
