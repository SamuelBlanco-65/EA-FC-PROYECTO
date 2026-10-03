# Enunciado del profesor (copia literal)

Texto pegado por el usuario el 2026-10-03. Es la referencia para comprobar que el proyecto cubre lo pedido. Las reglas cerradas del proyecto están en `CLAUDE.md`; el estado, en `docs/PROGRESS.md`; la cobertura punto por punto, en `docs/defense/INDEX.md`.

---

Evaluación Parcial de Desarrollo Móvil (V2): Plataforma de Torneos EA FC (Companion App & Realtime Infrastructure)

## 1. Contexto y Propósito del Proyecto

Este proyecto simula una aplicación complementaria (Companion App) e infraestructura interactiva para la gestión integral de un torneo de EA Sports FC de alta exigencia. Los estudiantes deben conectar un backend en Supabase con una aplicación móvil altamente concurrente que combine procesamiento automatizado de datos externos, gestión de estado global compleja, sincronización en tiempo real mediante WebSockets y renderizado gráfico avanzado en interfaces personalizadas.

El reto evalúa la capacidad del ingeniero de software móvil para diseñar sistemas donde la latencia de red, la seguridad de base de datos a nivel de filas (RLS) y la experiencia de usuario interactiva deben operar de manera impecable bajo reglas de negocio estrictas.

## 2. Módulos y Requisitos Técnicos Obligatorios

### Módulo 1: Ingesta Masiva de Datos (Web Scraping) y Autenticación

- **Seeding Automatizado:** Construcción de scripts externos (Python o Node.js) encargados de realizar web scraping de los planteles de jugadores de los top 5 clubes de las 5 mejores ligas de Europa, estructurando y cargando masivamente la información en las tablas relacionales de Supabase.
- **Autenticación y Ruleta de Asignación:** Registro e inicio de sesión independiente para cada participante. Al completar el primer acceso, una ruleta animada en la aplicación selecciona de forma pseudoaleatoria y persistente el club oficial con el que el usuario competirá durante todo el campeonato.

### Módulo 2: Estructura de Liga y Calendario de Partidos

- **Formato Todos contra Todos:** Generación automática del calendario bajo modalidad de ida y vuelta (local y visitante) para todos los participantes registrados.
- **Sistema de Puntuación Estándar:** 3 puntos por victoria, 1 punto por empate y 0 puntos por derrota, con cálculo dinámico de diferencia de goles y tabla de posiciones en tiempo real.
- **Panel de Administración:** Módulo exclusivo para que el administrador controle el inicio oficial del torneo y habilite secuencialmente las fechas de juego activas.

### Módulo 3: Sala de Partido en Vivo y Validación Cruzada (WebSockets)

- **Vista Horizontal de Partido:** Al iniciar una fecha activa, los usuarios acceden a una interfaz orientada exclusivamente en modo horizontal diseñada para el registro ágil de eventos en tiempo real (goles, tarjetas amarillas, tarjetas rojas), con la restricción estricta de modificar únicamente las estadísticas del equipo propio.
- **Handshake de Finalización y Arbitraje Remoto:** Al concluir el encuentro, el equipo local registra el resultado final. En ese instante, se dispara una notificación reactiva mediante Supabase Realtime (WebSockets) hacia el equipo visitante, el cual debe aprobar o rechazar el marcador. En caso de discrepancia, el partido pasa a estado de "Disputa" requiriendo intervención del administrador.

### Módulo 4: Pizarra Táctica (Gestos Avanzados y Canvas 2D)

- **Drag & Drop Absoluto:** Vista de gestión de plantilla donde el usuario puede arrastrar y soltar fichas de jugadores sobre un campo de fútbol dibujado en un lienzo personalizado (Canvas), calculando coordenadas en tiempo real, restricciones de límites de pantalla y reasignación de formaciones tácticas sin caídas de rendimiento (60 FPS).

## 3. Metodología de Evaluación y Defensa Técnica (Sostenibilidad del Código)

La nota final de este parcial no se basa únicamente en la entrega del software funcionando. Se llevará a cabo una sesión de defensa presencial individual y grupal obligatoria para verificar la autoría y el dominio técnico bajo las siguientes directrices:

- **Dinámica de Preguntas Aleatorias:** El profesor seleccionará 5 preguntas de manera totalmente aleatoria dirigidas a integrantes específicos del grupo de trabajo. Ningún estudiante puede responder por sus compañeros; cada pregunta es nominal e intransferible.
- **Escala de Calificación por Pregunta:** Cada una de las 5 preguntas se evaluará bajo la siguiente escala cualitativa con impacto directo sobre la nota final:
  - **No supo responder (0% de nota):** El estudiante desconoce los fundamentos técnicos, la estructura de la base de datos, el código de los WebSockets o la lógica de negocio implementada en el módulo consultado. Evidencia desconocimiento del trabajo en equipo.
  - **Respondió parcialmente (50% de note):** El estudiante reconoce conceptos generales o localiza archivos en el proyecto, pero es incapaz de explicar los flujos de datos asíncronos, la gestión de estados globales, las políticas de seguridad RLS de Supabase o la optimización del lienzo gráfico.
  - **Respondió perfecto (100% de nota):** El estudiante argumenta con precisión matemática e ingenieril las decisiones de arquitectura, el manejo de eventos en tiempo real, la sincronización offline y responde con solidez a cualquier contrapregunta de nivel técnico.
- **Impacto Global en la Nota:** Las 5 preguntas aleatorias determinan gran parte de la calificación final del parcial. Una aplicación completa con deficiencias graves en la defensa oral de sus creadores verá su nota final penalizada drásticamente.
