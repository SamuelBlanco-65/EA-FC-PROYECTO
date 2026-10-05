# Sistema de diseño v2 – "FC ARENA" · Dirección A: transmisión de TV deportiva

Estado: DECIDIDO (dirección) / PROPUESTO (valores). IMPLEMENTADO en la Fase 12 (2026-10-05, ramas `redesign-v2` y `plantilla-detalle`); los valores siguen sin validarse en pantalla, ver `docs/PROGRESS.md`. Escrito el 2026-10-05 tras una auditoría crítica del diseño v1 (sesión de análisis, sin código modificado).
Reemplaza a `design-system.md` (v1) SOLO en la rama de rediseño; v1 queda intacto como historial y respaldo de `master`. Pantalla por pantalla: `screens-v2.md`.

## 0. Cómo leer este documento
- **No existen imágenes v2.** `PROMPTS.md` (Fase 12) hablaba de `design/reference-v2/`; esa carpeta no existe. La fuente de verdad del v2 es este documento y `screens-v2.md`. No inventes pantallas: lo que no esté aquí, se pregunta al usuario.
- **Los valores (hex, tamaños, duraciones) son PROPUESTOS**, no muestreados de ninguna imagen. Los contrastes los calculé con la fórmula WCAG sobre estos hex (ver §1). Cada valor se valida en el teléfono (Expo Go, Android 14) antes de darlo por bueno.
- Marcas: **VERIFICAR** = hay que comprobarlo contra documentación o en el teléfono antes de usarlo. Nada de esto está probado en la app.
- La app sigue siendo **solo modo oscuro**, y la Sala sigue siendo **horizontal**.

## 1. Por qué cambia el diseño (diagnóstico v1, resumido)
El v1 es copia fiel de capturas generadas; el problema está en las capturas, no en el código. Patrones de "diseño genérico de IA" confirmados en el código:
1. Un único contenedor `Card` (radio 20, borde 1, padding 16) para todo; Inicio apila 4 bloques con la misma estructura.
2. Paleta navy `#0A0E1A` + verde neón `#00E58D` + azul `#3B6CF0`: indistinguible de una app cripto o fintech. El verde significaba 6 cosas (acción, activo, "mío", en línea, DG positivo, éxito).
3. Brillos de color (`glowAccent`) y degradados casi imperceptibles en botones, tarjeta destacada, GOL, aro del avatar, logo; fondo con rayas al 3 % y resplandor radial (Skia en cada pantalla).
4. Cuadrículas de métricas iguales (Inicio 4 tiles, Admin 2, Sala 3), iconos dentro de círculos de color en estados vacío/error, exceso de badges (hasta 5 chips en la cabecera de la Sala), bordes en todas las superficies, `Eyebrow` con barrita en cada sección, bordes discontinuos con 4 significados distintos.
5. Dos lenguajes de forma mezclados (paralelogramos `skewX` + rectángulos redondeados de radio 14-24).
6. Casi sin movimiento: Reanimated solo en ruleta, pizarra y parpadeo del skeleton; Stack con `fade` global; pestañas sin transición; sin hápticos.
7. Jerarquía invertida en Inicio (saludo y "Mi club" por encima del partido) y nombre de club truncado en Tabla ("Real …", "Bayer…").

## 2. Principios de la dirección A
Inspiración: gráficos de transmisión de TV (marcador "scorebug", cintas de eventos, rótulos), y el lenguaje de EA FC (oscuro, números grandes, color de club protagonista). Reglas:
1. **Un solo color de marca: la señal.** Naranja `#FF5B14` para "en vivo" y la acción primaria. Nada más es "acento".
2. **Plano.** Sin brillos, sin `shadow`/`elevation` decorativos, sin degradados de acento. El relieve sale del contraste de superficies, no de bordes.
3. **Los números mandan.** Marcador, posición y puntos son los elementos más grandes de su pantalla. Sin cajas alrededor de cada dígito.
4. **El color del club es el color de la pantalla.** El equipo propio y el rival aportan color en héroes, filas y líneas de tiempo. Ver §4.
5. **Lo mío se marca con forma, no con color:** barra lateral blanca de 4 dp + superficie algo más clara. Se acabó el verde para "mío".
6. **Una forma:** rectángulos de esquina casi recta (radio 4-8). Se ELIMINA `skewX` en toda la app (el v1 pedía "verificar"; la decisión es quitarlo). Opcional y solo en 2-3 piezas héroe (scorebug, cabecera de partido): "esquina cortada" simulada con un cuadrado rotado 45° del color del fondo (sin clip-path; VERIFICAR nitidez en Android).
7. **Menos cromo.** Tarjeta solo para lo accionable o lo agrupado de verdad. Listas con divisores de 1 dp, no una tarjeta por fila. Sin `Eyebrow` con barrita en cada sección.
8. **Mínimo 12 sp** de texto; lo importante nunca va en gris de 12 sp.
9. **Movimiento con función** (§8): orientar, confirmar, dar vida al marcador. Sin decoración continua salvo el punto de "en vivo".
10. **Estados honestos:** una sola señal de "sin conexión", skeleton con forma de la pantalla, vacíos con ilustración de fútbol (§7).

## 3. Paleta (modo oscuro único)
Todos PROPUESTOS. Ratios de contraste calculados por mí (WCAG, sobre `panel` salvo indicación); no muestreados en pantalla.

| Token | Hex | Uso | Contraste |
|---|---|---|---|
| `ink` | `#0B0E13` | Fondo de pantalla (plano; sin rayas ni resplandor) | — |
| `panel` | `#161B24` | Paneles, filas, inputs | — |
| `panelRaised` | `#1E2430` | Panel elevado, mi fila, modal, pressed | — |
| `line` | `#262D3A` | Divisores de 1 dp | — |
| `lineStrong` | `#343D4D` | Contorno de botón secundario, foco de input | — |
| `paper` | `#F2F4F7` | Texto principal, cifras | muy alto |
| `textSecondary` | `#9AA4B5` | Subtítulos, etiquetas | ≈ 6,9 : 1 |
| `textTertiary` | `#6B7586` | SOLO deshabilitado / placeholder; nunca información | no usar para info |
| `signal` | `#FF5B14` | En vivo, botón primario, indicador de pestaña activa | — |
| `onSignal` | `#0B0E13` | Texto sobre `signal` | ≈ 6,2 : 1 (blanco sobre `signal` ≈ 3,1: NO usar) |
| `signalPressed` | `#E04E0C` | Botón primario pulsado | — |
| `cardYellow` | `#FFC72C` | Tarjeta amarilla, "Pendiente", aviso/offline | alto |
| `cardRed` | `#E5384C` | Tarjeta roja, disputa, error (relleno e iconos) | ≈ 4,1 : 1 como texto: usar `dangerText` |
| `dangerText` | `#FF6B7A` | Texto de error/disputa | ≈ 6,3 : 1 |
| `positive` | `#35C98A` | DG positivo, "Confirmado", éxito | ≈ 8,1 : 1 |
| `overlay` | `rgba(0,0,0,0.72)` | Fondo de modales | — |

Reglas de color:
- **Semántica de partido:** ACTIVE = `signal`; PENDING_CONFIRMATION = `cardYellow`; CONFIRMED = `positive`; DISPUTED = `cardRed`/`dangerText`; SCHEDULED y RESOLVED = neutro (`textSecondary` / `paper`). El badge ya no es una pastilla de relleno: es punto o icono de 8-14 dp + texto, sin fondo, salvo EN VIVO (relleno `signal`).
- `cardYellow` es a la vez amarilla y aviso: aceptado; la tarjeta siempre lleva su icono.
- Conexión: punto neutro cuando todo va bien (o nada); `cardYellow` solo cuando hay problema. Se acabó la pastilla verde "En línea"/"Conectado".
- Colores por liga de la ruleta (`leagueColors`): se mantienen solo en la ruleta (Fase de rediseño de la ruleta, ver `screens-v2.md`).
- **Eliminar tokens v1:** `accent*`, `info*`, `glow*`, `stripe`, `borderDashed` como lenguaje, `shadows.glow*`.

## 4. Color de club (identidad por equipo)
**Problema de datos (VERIFICADO):** el backend ya expone `primaryColor`/`secondaryColor` (`backend/app/repositories/club_repository.py:11`, `mobile/src/api/types.ts` `Club`), pero en los JSON de `scraper/data/normalized/` que revisé (8 de 25) `primary_color` es `null`. No se toca backend en esta fase.
**Decisión:** mapa estático en `mobile/src/theme/clubColors.ts`, clave = `shortName` (los de `config/tournament-clubs.json`; VERIFICAR que coinciden con `clubs.short_name` en la BD, y que `StandingRow.clubShortName` / `FixtureTeam.shortName` los traen: sí traen `shortName`, VERIFICADO en `types.ts`). Si el club no está o `primaryColor` de la API no es null, se usa el de la API; si no, `lineStrong`.

Valores ESTIMADOS de memoria, NO validados contra los escudos reales. Hay que ajustarlos mirando cada escudo en el teléfono:

| Liga | Club (short) | Color principal | Nota |
|---|---|---|---|
| Premier | ARS | `#EF0107` | |
| | MCI | `#6CABDD` | |
| | MUN | `#DA291C` | |
| | AVL | `#95BFE5` | el granate oficial `#670E36` es demasiado oscuro sobre `ink`; usa el celeste |
| | LIV | `#C8102E` | |
| LaLiga | BAR | `#A50044` | secundario `#004D98`; el granate puro es oscuro: aclarar |
| | RMA | `#FEBE10` | el blanco no sirve de color; dorado como acento |
| | VIL | `#FBE122` | |
| | ATM | `#CB3524` | |
| | BET | `#0BB363` | |
| Serie A | INT | `#0068A8` | |
| | NAP | `#12A0D7` | |
| | ROM | `#F0BC42` | el granate es oscuro; dorado como acento |
| | COM | `#1B4F9C` | |
| | MIL | `#FB090B` | |
| Bundesliga | BAY | `#DC052D` | |
| | BVB | `#FDE100` | |
| | RBL | `#DD0741` | |
| | VFB | `#E32219` | |
| | HOF | `#1961B5` | |
| Ligue 1 | PSG | `#004170` | muy oscuro: usar `#DA291C` o aclarar |
| | LEN | `#E01B22` | VERIFICAR (rojo y oro) |
| | LIL | `#E01E13` | |
| | LYO | `#0B3F9A` | |
| | MAR | `#2FAEE0` | |

**Regla de legibilidad:** función pura `readableOnInk(hex)` (con test unitario en `tests/`): si la luminancia relativa del color es < 0,10, se aclara (mezcla con blanco) hasta superarla; nunca se usa un color de club como TEXTO sobre `ink`/`panel` sin pasar por esa función. Para rellenos con texto encima: elegir `paper` u `onSignal` según el contraste del relleno.
**Dónde se usa:** (1) mitades del scorebug y héroe de partido; (2) barra vertical de 4 dp a la izquierda de la fila en Tabla/Calendario; (3) color de los marcadores en la línea de tiempo; (4) nunca en botones ni en navegación.

## 5. Tipografía
Tres papeles: **Display** (titulares, marcador, cifras grandes), **Texto** (cuerpo y datos), **Cifras tabulares**.
Paquetes (VERIFICADO que existen en npm el 2026-10-05): `@expo-google-fonts/big-shoulders-display` (0.2.3), `@expo-google-fonts/inter` (0.4.2). Alternativas verificadas en npm: `saira-condensed`, `saira-extra-condensed`, `oswald`, `barlow-semi-condensed`. **Cada familia en Expo Go: NO PROBADO** (el mecanismo `useFonts` con paquetes `@expo-google-fonts/*` SÍ funciona hoy con Barlow en el teléfono del usuario).

| Papel | Familia | Notas |
|---|---|---|
| Display | Big Shoulders Display 800/900, mayúsculas, **no itálica** | Los nombres exactos de los exports (`BigShouldersDisplay_800ExtraBold`…) hay que leerlos del paquete instalado: VERIFICAR. |
| Texto | Inter 400 / 500 / 600 / 700 | |
| Cifras | Display para grandes; Inter con `tabular-nums` para tablas | `fontVariant: ['tabular-nums']` con fuentes personalizadas en Android: VERIFICAR. Para el marcador, no depender de eso: cada dígito va en una celda de ancho fijo. |

**Plan B sin riesgo (decidido):** si Big Shoulders falla en Expo Go o se ve mal, usar Barlow Condensed (ya instalada, funciona) en vertical (sin itálica) y Inter. Es el cambio más barato; Barlow no se desinstala hasta confirmar el nuevo par.
**Disciplina (corrige el defecto del v1):** itálica y mayúsculas NO en todo. Mayúsculas: titulares de pantalla, etiquetas de sección, botones. Nombres de club en caja de título solo en héroes. Cifras sin itálica. Texto de datos en caja normal.

Escala propuesta (sp / interlineado):

| Estilo | Familia | Tamaño | Uso |
|---|---|---|---|
| `scoreHero` | Display 900 | 64 / 64 | Marcador de héroe (Inicio) |
| `scoreBug` | Display 800 | 40 / 40 | Marcador de la Sala y scorebug |
| `titleScreen` | Display 800 | 32 / 34 | Título de pantalla (mayúsculas) |
| `titleClub` | Display 800 | 26 / 28 | Nombre de club en héroe |
| `rowCode` | Display 800 | 22 / 24 | Código de 3 letras en filas (BAY, INT) |
| `statBig` | Display 800 | 28 / 30 | Posición, puntos |
| `label` | Inter 600 | 14 / 18 | Etiquetas, mayúsculas con `letterSpacing` 1 |
| `body` | Inter 400 | 16 / 22 | Cuerpo |
| `bodyStrong` | Inter 600 | 16 / 22 | |
| `data` | Inter 600 tabular | 16 / 20 | Cifras de tabla |
| `caption` | Inter 400 | 13 / 18 | Secundario (mínimo 12 en todo el sistema) |
| `button` | Display 800 | 20 / 24 | Botones, mayúsculas, `letterSpacing` 0,5 |
| `tabLabel` | Inter 600 | 12 / 16 | |

## 6. Espaciado, forma y superficies
- Escala 4 dp: `4, 8, 12, 16, 24, 32, 48`. Margen lateral 16 dp.
- **Ritmo con jerarquía** (no `gap 12` en todo): dentro de un grupo 8-12; entre grupos 24-32; un héroe respira con 32+.
- Radios: botón 6, input 8, panel 8, badge/chip 4, escudo/contenedor 8, modal 12. Sin radio de 20-24.
- Bordes: ninguno en paneles (superficie contra `ink`); divisor 1 dp `line` entre filas; `lineStrong` solo en botón secundario y foco de input.
- Sombras: NINGUNA. `shadowColor`, `elevation` y `glow*` se retiran. (Además: sombra/`elevation` al enfocar un `TextInput` ya rompió el foco en Android; solo cambia el borde.)
- Fondo: color plano `ink`. Se elimina `ScreenBackground` con Skia (rayas + resplandor) de todas las pantallas; ahorra un `Canvas` por pantalla.
- Barra de pestañas: alto 64 dp + inset inferior; fondo `ink`, divisor superior 1 dp `line`.

## 7. Componentes (v2)
**Botón primario.** Alto 56, radio 6, fondo `signal`, texto `onSignal` (`button`). Pressed: `signalPressed` + escala 0,97. Deshabilitado/cargando: fondo `panelRaised`, texto `textTertiary`; spinner de 20 dp. Sin degradado ni brillo.
**Botón secundario.** Alto 52, transparente, contorno 1 dp `lineStrong`, texto `paper`.
**Botón de peligro.** Texto `dangerText`, contorno 1 dp `cardRed` al 50 %; relleno `cardRed` solo en confirmaciones destructivas.
**"Finalizar partido" (Sala).** Secundario (contorno `paper`) hasta que se pueda finalizar; no es un tercer color primario. En la Sala la acción dominante es **GOL**.
**Botones de evento (Sala).** GOL: relleno `signal`, tamaño grande (≥ 96 dp de alto, ancho ≥ 120 dp) junto al pulgar. Amarilla/Roja: contorno del color de su tarjeta, icono de tarjeta; tamaño táctil ≥ 56 dp.
**Input.** Alto 56, radio 8, fondo `panel`, borde 1 dp `line`; foco: borde `paper`/`lineStrong` (SOLO borde); error: borde `cardRed` + mensaje `dangerText`. Sin sombra, sin `elevation`, sin cambio estructural al enfocar. "Mostrar" contraseña: icono de ojo sin caja.
**Scorebug (nuevo, núcleo del lenguaje).** Barra horizontal: `[bloque color local | CÓDIGO | escudo | 2 : 1 | escudo | CÓDIGO | bloque color visitante]`. Cifras `scoreBug`/`scoreHero` en celdas de ancho fijo, sin cajas ni bordes. Equipo propio: etiqueta "TÚ" pequeña. Variante héroe (Inicio) y variante compacta (Sala).
**Fila de tabla.** Alto 56. Barra vertical 4 dp (color de club) | posición | escudo 28 | código de 3 letras (`rowCode`) con nombre completo y récord `3-1-0` en `caption` debajo | PJ | GF | DG | PTS. DG con `positive`/`dangerText`/neutro. Mi fila: `panelRaised` + barra blanca de 4 dp. Sin tarjeta contenedora: lista con divisores. Se muestra `clubShortName` (ya viene en `StandingRow`); si el código no existiera, `adjustsFontSizeToFit` con `minimumFontScale` 0,8.
**Fila de partido (Calendario).** Lista con divisores; escudos y códigos; marcador central sin cajas; estado como punto + texto. Mi partido arriba, más grande.
**Cinta de evento (Sala).** Minuto en `statBig`-pequeño a la izquierda, icono de evento (balón/amarilla/roja con `EventIcon`), jugador; el lado se indica por alineación y barra de color de club, NO repitiendo "TU EQUIPO/OPONENTE" en cada fila.
**Badges.** Ver §3. EN VIVO: relleno `signal`, texto `onSignal`, punto que pulsa. Sin pastillas de relleno suaves en el resto.
**Pestañas.** 4 pestañas (Inicio, Tabla, Calendario, Perfil). Plantilla NO se añade (es una feature no pedida; ver `player-cards-plan.md`). Activa: icono y etiqueta `paper`, barra superior de 3 dp `signal`; inactiva: `textSecondary`. UN solo indicador (no el triple del v1).
**Estados.**
- Carga: skeleton con barrido (shimmer) y formas que imitan la pantalla; nunca bloques genéricos.
- Vacío: ilustración de fútbol (portería + balón, dibujada con Skia o `View`; sin círculo de color con icono Feather) + titular Display + texto + acción.
- Error: mismo patrón con triángulo y `cardRed`, botón "Reintentar" primario.
- Sin conexión: UNA sola señal persistente y discreta (banda delgada `cardYellow`), no banner + pill + tarjeta.
**Iconos.** Se mantiene Feather (`@expo/vector-icons`) para UI y `EventIcon` propio para balón/tarjetas. Un solo peso de trazo, sin círculo de color alrededor.
**Chip "FPS" de la pizarra.** Herramienta de desarrollo: no se muestra en la UI final (ocultar salvo `__DEV__`).

## 8. Movimiento
Reanimated 4.5.1 y Gesture Handler ya están instalados (`package.json`). Todo PROPUESTO; probar en el teléfono.
| Qué | Cómo | Duración |
|---|---|---|
| Pulsar botón/fila | escala 0,97 + color pressed | 90 ms |
| Entrada de pantalla | `FadeInDown` escalonado, máx. 6 elementos | 220 ms, +40 ms por elemento (VERIFICAR en Reanimated 4.5.1) |
| Cambio de pestaña | fundido cruzado del contenido | 160 ms. `TabSlot` de `expo-router/ui` no anima por defecto; envolver cada pantalla en `Animated.View` con `entering`. VERIFICAR si `TabSlot` admite otra vía |
| Push/pop de pantalla | `animation` del Stack nativo (`slide_from_right`) | del sistema. VERIFICAR nombres exactos en la versión de expo-router instalada |
| Modales de la Sala | fundido + subida | 200 ms (`fade_from_bottom`, VERIFICAR) |
| Marcador al cambiar | "rodillo" vertical del dígito | 250 ms + destello breve del color de club |
| Cifras de Inicio/Tabla | cuenta ascendente al aparecer | 400 ms, solo primera carga |
| Punto EN VIVO | pulso de opacidad | 1,2 s, único bucle permanente |
| Skeleton | barrido de degradado | 1,2 s |
| Evento nuevo en la lista | entra desde arriba con fundido | 200 ms |
Reglas: respetar "reducir movimiento" (`useReducedMotion` de Reanimated; VERIFICAR); sin transiciones de elemento compartido (experimentales, VERIFICAR); sin animaciones dentro del Canvas de la pizarra.
**Hápticos:** `npx expo install expo-haptics` (VERIFICAR que funciona en Expo Go): ligero al registrar GOL/evento y al confirmar/rechazar; selección al cambiar de pestaña. Nada más.

## 9. Navegación
- Pestañas: ver §7. Pantallas con "volver": texto del destino real + chevron; consistente en Pizarra ("Perfil" mientras no exista Plantilla), Admin ("Perfil"), Resolver ("Administración").
- Sala: pantalla completa horizontal, sin pestañas; "Salir" siempre accesible.
- Ruleta: sin pestañas, solo avanza (sin cambios de flujo).

## 10. Fuera de alcance / no hacer
- No cambiar funcionalidad, rutas, API, hooks, stores, offline ni realtime (ver reglas duras en `PROMPTS.md` Fase 12).
- No añadir la pestaña Plantilla ni tarjetas de jugador (features no pedidas; `docs/design/player-cards-plan.md`).
- No tocar el `Canvas` de Skia de la pizarra (`Pitch.tsx`, `PlayerToken.tsx`) salvo estilos externos; si se toca, volver a medir 60 FPS (`docs/performance/tactical-board.md`).
- No editar `design-system.md`, `screens.md` ni `design/reference/` (v1).

## 11. Lista de VERIFICAR (antes de dar nada por bueno)
1. Exports reales de `@expo-google-fonts/big-shoulders-display` e `inter`, y que cargan en Expo Go.
2. `tabular-nums` con fuentes personalizadas en Android.
3. `FadeInDown`/`entering` y `useReducedMotion` en Reanimated 4.5.1.
4. Nombres de `animation` del Stack y si `TabSlot` permite transición.
5. `expo-haptics` en Expo Go.
6. "Esquina cortada" con cuadrado rotado: nitidez y rendimiento en Android.
7. Que `clubs.short_name` en la BD coincide con `config/tournament-clubs.json`.
8. Colores de club contra los escudos reales; que escudos oscuros/blancos se leen sobre `ink`/`panel` (puede hacer falta una base clara bajo el escudo).
9. Todos los hex y contrastes: validarlos en pantalla.
