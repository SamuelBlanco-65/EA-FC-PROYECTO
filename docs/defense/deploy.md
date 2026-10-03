# Defensa: despliegue del backend (Fase 7)

## Qué hace y flujo
El backend FastAPI corre en Render (plan gratuito) con HTTPS/wss. Flujo: `git push` a GitHub -> Render clona, ejecuta `pip install -r requirements.txt` y `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (`render.yaml`) -> el balanceador (Cloudflare + Render) termina TLS y reenvía por HTTP a uvicorn -> la app móvil usará `https://ea-fc-api.onrender.com` (REST) y `wss://.../ws`. Las claves de Supabase viven solo en las variables de entorno del panel (`sync: false`, no están en el repo); `Settings` (`app/core/config.py`) las lee del entorno. Verificación: `scripts/deploy/check_deploy.py` (`/health`, upgrade wss, rechazo anónimo, login + `AUTH_OK` + `PONG`).

## Decisiones
1. **Render y no Cloud Run.** El listener de Supabase Realtime es una tarea en segundo plano y `/ws` mantiene conexiones; Render deja el proceso con CPU mientras está despierto. Cloud Run con facturación por petición solo asigna CPU durante peticiones (lo leí en su documentación de facturación, no lo probé). Descartado también Koyeb (escala a cero y WebSocket de vida corta) y Fly.io (sin plan gratuito nuevo). Coste: el servicio se duerme.
2. **`AUTH_ERROR` como mensaje de datos antes de cerrar.** Medí que a través de Render la trama de cierre 4401 no llega (el cliente ve un cierre anormal a los ~21 s) pero los mensajes de datos sí. Alternativa descartada: que la app tratara cualquier cierre anormal como fallo de auth (pierde el motivo). Coste: contrato ampliado, el espejo de la app debe incluirlo. No sé qué pieza del proxy pierde la trama.
3. **Python fijado a 3.12.0** (`PYTHON_VERSION`): Render usa 3.14.3 por defecto y mis dependencias se probaron con 3.12.0.

## Preguntas probables
1. *¿Por qué Render?* Proceso persistente para WebSocket y listener, TLS gratis, despliegue declarativo. Límite: se duerme.
2. *¿Qué pasa cuando se duerme?* Medido: tras ~23,5 min sin tráfico el primer `/health` tardó 24 s. El listener está caído; no se pierde nada porque la BD es la verdad y la app vuelve a pedir el estado por REST.
3. *¿Dónde están las claves?* Variables de entorno en Render; `.env` está en `.gitignore`; revisé que el historial no contiene claves.
4. *¿Cómo sabes que funciona por wss?* `check_deploy.py` desde mi PC contra la URL pública: login real, `AUTH_OK` y `PONG` (252 ms).
5. *Difícil: ¿por qué no devolvéis el cierre 4401 y ya?* Lo hacemos, pero en Render no llega. Lo detecté midiendo (cierre anormal a los 21 s), no por suposición; la causa exacta no la he determinado, por eso se manda además un mensaje de datos.

## Errores típicos
- Build falla por versión de Python: ajustar `PYTHON_VERSION` en `render.yaml`.
- Variable vacía o con placeholder: la app no arranca (validador en `Settings`).
- Primera petición lenta tras dormir: la app debe tolerar ~1 min y reconectar el WS.
