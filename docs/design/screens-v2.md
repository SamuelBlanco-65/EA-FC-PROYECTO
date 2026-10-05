# Pantallas v2 – plan de rediseño (Dirección A: transmisión de TV)

Escrito el 2026-10-05 para pasar el contexto a la siguiente sesión. Tokens y componentes: `design-system-v2.md` (léelo primero). Reglas duras y entrega: `PROMPTS.md` → "Fase 12".
**No hay imágenes v2.** Cada pantalla se rediseña según este documento; las capturas de `design/reference/` (v1) solo sirven para saber qué hay hoy. Si algo no está aquí, pregunta al usuario en lugar de inventar.
Esfuerzo: S ≈ 2 h, M ≈ medio día, L ≈ un día o más. Todo es ESTIMADO. Nada está implementado ni probado.

## 0. Contexto y decisiones tomadas (sesión 2026-10-05)
- Se hizo una auditoría crítica del v1 (sin código modificado). El usuario eligió la **dirección A** (transmisión de TV: scorebug, cintas de eventos, una sola señal naranja, color de club protagonista).
- Objetivo del usuario: diseño más profesional y parecido a EA FC, con animaciones y transiciones entre vistas, "como si fuera a producción".
- **Plazo:** entrega el 2026-10-06. `PROMPTS.md` ya dice "estabilidad antes que estética". `master` es la versión defendible y no se toca. Trabajo en la rama `redesign-v2` (la que está activa; `PROMPTS.md` decía `design-v2`, se actualizó). Un commit por paso; sin merge a master sin que el usuario lo diga.
- La app sigue en modo oscuro único; la Sala sigue horizontal; el flujo y las rutas no cambian.

## 1. Orden de trabajo y corte de seguridad
Por capas, y parando donde se acabe el tiempo. Tras CADA paso: `npx tsc --noEmit`, `npm run test:logic` (65 deben seguir pasando), `npx expo export --platform android`, y el usuario prueba en el teléfono. No digas "funciona" sin que lo haya visto.

| Paso | Qué | Esfuerzo | Notas |
|---|---|---|---|
| P0 | `src/theme/`: tokens v2 (paleta, tipografía, espaciado, radios), carga de fuentes, `clubColors.ts` + `readableOnInk` (con test unitario puro) | M | Plan B de fuente: Barlow Condensed vertical + Inter |
| P1 | `src/components/`: `Button`, `Card` (rebajado a panel plano), `TabButton`/tab bar, `StateViews` (skeleton shimmer, vacío, error), `MatchStatusBadge`, `ConnectionBanner`, nuevo `Scorebug`; eliminar `ScreenBackground` (Skia) de las pantallas | M | Quitar brillos, degradados, `shadows.glow*`, `skewX` |
| P2 | **Tabla** (alto impacto, bajo coste) | S | Ver §2 |
| P3 | **Inicio** | M | Ver §2 |
| P4 | Calendario, Perfil | M | |
| P5 | Login, Registro | M | |
| P6 | Modal de resultado, Sala | M | Sala: ver aviso de rendimiento. No hay pantalla de Detalle (ver §2) |
| P7 | Movimiento base (§3) | M | Se puede intercalar tras P2/P3 |
| P8 | Admin, pizarra (solo estilos externos) | S | |
| P9 | Revelación de la ruleta | L | Después de la entrega |

**Corte recomendado para la entrega del 6 oct:** P0 + P1 + P2 + P3 y, si queda margen, P7 básico. Todo lo demás, después de la defensa. Al terminar, dile al usuario qué pantallas quedaron sin rediseñar (lo pide `PROMPTS.md`).

## 2. Plan por pantalla (problemas v1 → cambio v2)
Severidad: A = alta, M = media, B = baja.

### Global
- (A) Verde con 6 significados → un color por rol (§3 de `design-system-v2.md`). M
- (A) Casi sin movimiento → §3 de este documento. M
- (M) Indicador de pestaña triplicado → una barra superior `signal` + icono/etiqueta `paper` (`TabButton.tsx`). S
- (M) Texto clave en 10-12 px (`match/[id].tsx` `scoreLabel` 10 px, "TU CLUB" 10 px, etiquetas de evento 11 px) → mínimo 12 sp, lo importante nunca en gris. S
- (M) Escudos reales sobre `panel`: escudos oscuros o blancos pueden perderse → NO VERIFICADO con la app; probar y, si hace falta, base clara/difuminada bajo el escudo. S

### Login / Registro (`app/(auth)/*`) – P5
- (M) La marca se repite 3 veces en 300 dp y deja ~21 % de pantalla vacía. → Hero a sangre con la marca arriba, formulario en el tercio inferior cerca del pulgar, una sola vez el título. M
- (B) "Mostrar" contraseña dentro del input con caja → icono de ojo. **No cambiar estructura del input al enfocar** (solo borde). S

### Ruleta (`app/roulette.tsx`) – P9 (después de entrega)
- (A, por oportunidad) Es el momento más emocional y hoy parece una ruleta de casino; resultado en tarjeta centrada con confeti y rayos verdes. → Revelación tipo "abrir sobre": el color del club inunda la pantalla, el escudo cae con rebote, el nombre se compone. L
- (M) "SORTEO ÚNICO" + título + subtítulo + aviso dicen lo mismo 3 veces. S
- Hasta entonces: solo aplicar tokens (colores, botón) sin tocar la lógica ni la `Wheel`.

### Inicio (`app/(tabs)/home.tsx`) – P3
- (A) Jerarquía invertida: saludo (32 px) y tarjeta "Mi club" (~190 px, nada accionable, duplicada en Perfil) van antes que el partido. → **Un héroe a sangre** con el próximo partido: scorebug grande (`scoreHero`), color de cada club, código y escudo, estado, y "Entrar a la sala" como único botón primario. Saludo pequeño arriba. Se QUITA `ClubCard`. M
- (A) `StatsRow` = 4 tiles iguales → una línea: `#2` grande (`statBig`) + `10 PTS · +6 DG`, tocable hacia Tabla. S
- (M) Marcador de 2 cajas sin separador ("2 1" se lee "21") → scorebug con separador y tamaño mayor. S
- (M) "FECHA 5 DE 7" a 34 px compite con el saludo, queda abajo y deja ~12 % vacío → barra de fechas compacta, sin tarjeta. S
- (M) Pill verde "En línea" con borde y punto → punto discreto, o nada si todo va bien. S
- Estados que deben seguir: DRAFT ("Esperando inicio"), sin partido ("Sin partidos pendientes"), admin que no juega, carga (skeleton con la forma del héroe), error, sin conexión (UNA señal). Verificar cada uno. El `canEnterRoom`, `myNextMatch`, `summarizeRounds` no se tocan.

### Tabla (`app/(tabs)/standings.tsx`) – P2
- (A) El nombre del club sale truncado ("Real …", "Bayer…", "Man. …"; `numberOfLines={1}` en `standings.tsx:118`) porque 8 columnas numéricas se reparten el ancho; "TU CLUB" se parte en 3 líneas a 10 px. → Fila v2 (ver `design-system-v2.md` §7): barra de color de club | posición | escudo | **código de 3 letras** (`clubShortName`, ya en `StandingRow`) con nombre completo y `G-E-P` en caption | PJ | GF | DG | PTS. Mi fila: `panelRaised` + barra blanca. Sin tarjeta contenedora. S
- (M) Cabecera de 3 niveles (eyebrow + título + pill verde "Actualizado en tiempo real") antes de la primera fila → un título y un punto de estado discreto. S
- (M) Tarjeta "Criterio de desempate" + párrafo de leyenda ocupan más que la tabla → colapsar en un icono "?"/hoja inferior o una línea de pie. S
- Lógica intacta: orden y tiebreak vienen del servidor. Estados: skeleton con forma de filas, vacío, error, sin conexión, "Datos guardados".

### Calendario (`app/(tabs)/fixtures.tsx`) – P4
- (M) Todas las filas son la misma tarjeta con distinto borde; "TU PARTIDO" es una etiqueta de 12 px → mi partido primero y más grande; resto como lista con divisores, sin tarjeta por fila. M
- (M) Tarjeta "Estados" con 6 badges explicando lo que ya dicen los badges → eliminarla. S
- (B) Triple encabezado (eyebrow, chip de fecha, título "Fecha 5 · 3 partidos" + "En curso") → uno. S
- Mantener: chips de fecha desplazables (el cortado indica scroll), fila de descanso, estados de partido.

### Detalle de partido (captura v1 nº 7) – NO EXISTE como pantalla
- VERIFICADO en el código: no hay ruta de Detalle. `app/match/[id].tsx` es la Sala horizontal y la única entrada es el botón "Entrar a la sala" (`home.tsx:187`, `fixtures.tsx:181`), solo cuando `canEnterRoom(status)`. La línea de tiempo vertical de la captura 7 no está implementada.
- **No crear esta pantalla** en la Fase 12 (es una pantalla/ruta nueva, no un rediseño). Si el usuario la quiere, hay que pedirlo como fase aparte. Lo único aprovechable para la Sala: cintas de evento con color de club (ver Sala).

### Sala de partido (`app/match/[id].tsx` + `src/features/match/*`) – P6
- (A) Cabecera con 6 elementos (Salir, título, EN VIVO, marcador, Conectado, "Eres el local") y marcador de 44×52 en pantalla de 915 dp; nombres de equipo a 10 px → **scorebug compacto centrado** (escudos, códigos, marcador `scoreBug`); conexión como icono pequeño; "Eres el local/visitante" como texto discreto. M
- (A) "FINALIZAR" es un tercer color primario (blanco) junto a GOL y EN VIVO → GOL dominante y grande junto al pulgar; Finalizar secundario. S
- (M) ~15 % de la tarjeta "Tu equipo" vacía y botones de 74 dp; en la referencia "AMARILLA" desborda → botones mayores (§7 de `design-system-v2.md`). S
- (M) "TU EQUIPO"/"OPONENTE" repetido en cada evento, 11 px → cintas con alineación por lado y barra de color. S
- (M) El oponente ocupa 1/3 con 3 números grises y candado → columna delgada. S
- **Rendimiento:** el único `Canvas` de Skia en la Sala es `ScreenBackground`; quitarlo ayuda. Si se añade cualquier Canvas nuevo, medir FPS en el teléfono.
- **No cambiar:** cola offline, `Finalizar` bloqueado con pendientes, `EventModal`, `ResultModal` (lógica), landscape lock.
- Modal de resultado (visitante): Confirmar primario, Rechazar secundario con contorno (hoy ambos con degradado y brillo, peso igual aunque abre una disputa); reducir el hueco entre marcador y botones. S

### Perfil (`app/(tabs)/profile.tsx`) – P4
- (M) Nombre, email y rol aparecen DOS veces (cabecera + 3 filas) → quitar las filas duplicadas. S
- (M) "Cerrar sesión" pesa como un CTA → texto/contorno `dangerText`, bajo peso. S
- (M) Avatar con aro degradado → iniciales sobre `panelRaised`, sin degradado. S
- Mantener las entradas "Pizarra táctica" y "Administración" (solo admin).

### Administración y Resolver disputa (`app/admin/*`) – P8
- (M) En la referencia v1: control segmentado "Borrador/En curso/Finalizado" que no es tocable (falsa affordance), botón "Iniciar torneo · Iniciado" que parece desactivado, dos tiles de métricas con barras → estado como texto y un solo CTA que cambie según la fase. VERIFICAR contra `app/admin/index.tsx` antes de tocar (la referencia v1 no existía cuando se programó). S
- Mantener la lógica de botones deshabilitados y los mensajes 409 tal cual.

### Pizarra táctica (`app/tactics.tsx`) – P8
- (M) Chip "60 FPS" es herramienta de desarrollo → mostrar solo en `__DEV__`. S
- (B) Botón atrás "Perfil" correcto mientras no exista Plantilla. S
- Solo estilos externos (barra superior, botón Guardar, chips de formación). `Pitch.tsx`/`PlayerToken.tsx` (Skia) no se tocan; si se toca, remedir 60 FPS.

### Estados comunes (componentes, no ruta) – P1
- Skeleton: barrido de degradado con formas de la pantalla (hoy parpadeo de opacidad en bloques).
- Vacío y error: ilustración de fútbol, no círculo de color con icono (`StateViews.tsx:64-81`).
- Sin conexión: una sola señal persistente.

## 3. Movimiento y transiciones (resumen; detalle en `design-system-v2.md` §8)
- Hoy: Reanimated solo en ruleta, pizarra y `Skeleton`; `Stack` con `animation: 'fade'` global (`app/_layout.tsx:47`); `TabSlot` sin transición; pulsar = `opacity 0.85`; sin hápticos.
- Plan: escala al pulsar, entradas escalonadas, fundido entre pestañas (envolviendo cada pantalla), `slide_from_right` en push, modales con subida, marcador con "rodillo", punto EN VIVO con pulso, shimmer en skeleton, hápticos ligeros en GOL/confirmar/rechazar/cambio de pestaña.
- VERIFICAR antes de depender de ello: `entering` en Reanimated 4.5.1, nombres de `animation` en la versión de expo-router instalada, si `TabSlot` admite transición, `expo-haptics` en Expo Go, `useReducedMotion`.

## 4. Criterios de aceptación (por paso)
1. `npx tsc --noEmit` limpio, `npm run test:logic` ≥ 65 passed, `npx expo export --platform android` empaqueta.
2. El usuario probó la pantalla en el teléfono y confirma; los estados (carga, vacío, error, sin conexión) se revisaron uno a uno.
3. Ningún archivo de `backend/`, `supabase/`, `scripts/`, `mobile/src/api`, hooks, stores, `offline`, `realtime` ni tests existentes cambió (salvo que un cambio visual los rompa y se explique).
4. Los campos de texto siguen conservando el foco al escribir (login, registro, admin).
5. Pizarra: 60 FPS no empeoran (si se toca algo de su pantalla).

## 5. Preguntas abiertas para el usuario
1. ¿Qué pantallas entran en la entrega del 6 oct? (Recomendado: Tabla e Inicio, más tokens y componentes.)
2. Validar el mapa de 25 colores de club contra los escudos reales (están estimados de memoria).
3. ¿Se acepta Plan B de tipografía (Barlow Condensed vertical + Inter) si Big Shoulders no carga bien en Expo Go?
4. Revelación de la ruleta (P9): ¿después de la defensa?

## 6. Qué NO es esto
No es una feature nueva: no hay pestaña Plantilla, tarjetas de jugador, ni cambios de reglas de negocio (`CLAUDE.md`). La Plantilla y las tarjetas siguen documentadas aparte en `player-cards-plan.md`.
