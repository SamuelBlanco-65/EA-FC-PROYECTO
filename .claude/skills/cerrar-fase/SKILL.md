---
name: cerrar-fase
description: Procedimiento para cerrar una fase del proyecto EA FC: verificar, actualizar docs/PROGRESS.md, escribir la ficha de defensa y hacer commit. Usar al terminar cualquier fase o cuando el usuario diga "cierra la fase".
---

# Cerrar fase

1. Ejecuta las verificaciones de la fase (tests, typecheck, arranque). No marques nada como hecho sin ejecutarlo.
2. Actualiza `docs/PROGRESS.md` (añade arriba, máx. 25 líneas por fase):
   ```
   ## Fase N – <nombre> – <fecha>
   Estado: COMPLETA | PARCIAL | BLOQUEADA
   Hecho (VERIFICADO): ...
   No probado / pendiente: ...
   Decisiones clave: ...
   Archivos principales: ...
   Cómo probarlo: <comandos exactos para Windows>
   Siguiente paso: ...
   ```
3. Escribe o actualiza `docs/defense/<modulo>.md` (máx. 1 página) en español:
   - Qué hace y flujo de datos paso a paso (referenciando archivos reales).
   - 2-3 decisiones: por qué así, alternativa descartada, coste.
   - 5 preguntas probables del profesor con respuesta modelo corta, incluida una contrapregunta difícil.
   - Errores típicos y cómo se manejan.
4. Commit: `git add -A && git commit -m "phase N: <resumen>"` (verifica antes que .env no esté incluido).
5. Responde al usuario con: estado, qué probar manualmente (pasos), y las 3 ideas que más debe memorizar para la defensa. Breve.
