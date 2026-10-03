# Despliegue del backend (Fase 7)

Consultado el 2026-10-03. Los límites de los planes gratuitos cambian a menudo: re-comprobar antes de la defensa.
Leyenda: VERIFICADO = leído en la documentación oficial del proveedor o ejecutado. NO PROBADO = documentado pero no ejecutado por mí. VERIFICAR = fuentes contradictorias.

## 1. Comparativa

| | **Render** (web service free) | **Google Cloud Run** | **Koyeb** (Free Instance) |
|---|---|---|---|
| Plan gratuito | 750 h de instancia/mes por workspace (31,25 días = 24/7 para un servicio) VERIFICADO | Always Free: 2 M peticiones, 360 000 GB-s, 180 000 vCPU-s, 1 GB salida desde Norteamérica por mes (facturación por petición) VERIFICADO | 512 MB RAM, 0,1 vCPU, 2 GB; una por organización; solo Fráncfort o Washington (docs) VERIFICADO en docs; VERIFICAR: un tercero afirma que desde feb-2026 los usuarios nuevos deben contratar Pro |
| Tarjeta | La doc no la exige explícitamente; suspende el servicio "si no hay método de pago" al agotar cuotas. VERIFICAR en el alta | Se espera que exija cuenta de facturación (tarjeta) aunque uses solo la cuota gratis; NO leído en la fuente (la página de precios llegó truncada). VERIFICAR | VERIFICAR (ver arriba) |
| Se duerme | Sí: tras **15 min** sin tráfico entrante. Desde el 2026-02-24 cuenta como actividad un **mensaje WebSocket entrante** de una conexión existente VERIFICADO | Escala a 0 sin tráfico; una instancia con un WebSocket abierto cuenta como activa VERIFICADO | Sí: a 0 tras **1 h** sin tráfico, no configurable. Con escala a cero no admite conexiones retenidas; un WebSocket puede despertarlo pero "puede vivir solo unos minutos" VERIFICADO en docs |
| Arranque en frío | "Aproximadamente un minuto" VERIFICADO | Segundos (no medido) NO PROBADO | No medido NO PROBADO |
| WebSocket + HTTPS | Sí; TLS gestionado y gratuito, termina en su balanceador VERIFICADO | Sí; límite de petición hasta 60 min (defecto 5): hay que reconectar; afinidad de sesión "best effort"; máx. 1000 conexiones por contenedor VERIFICADO | Sí, con la limitación de arriba |
| Encaje con ESTE backend | Bueno: el proceso sigue vivo con CPU completa mientras está despierto, así que el listener de Supabase Realtime (tarea en segundo plano) funciona | **Problema**: con facturación por petición la CPU solo está asignada mientras hay peticiones; el listener (tarea en segundo plano, conexión saliente) quedaría sin CPU entre peticiones. Instancia-based billing evitaría el problema pero sus cuotas gratis no las he verificado | Escala a cero y WebSocket de vida corta chocan con `/ws` |

Descartado: **Fly.io**. No hay plan gratuito para cuentas nuevas: solo una prueba de 2 horas de VM o 7 días (fuentes de terceros coincidentes; no leído en la página oficial) VERIFICAR.
No miré Railway, Hugging Face Spaces ni otros: la búsqueda sobre Spaces no aclaró nada de WebSockets y no quise afirmar nada sin fuente.

## 2. Recomendación: Render

Razones, ligadas al código:
1. `/ws` y el listener de Realtime (`app/realtime/listener.py`) necesitan un proceso persistente con CPU mientras está despierto. Render lo da; Cloud Run con facturación por petición, no.
2. Sin tarjeta que yo sepa (VERIFICAR en el alta) y sin cuota que se agote antes de fin de mes.
3. Despliegue declarativo con `render.yaml` (Blueprint) en el repo: reproducible y explicable.

Contrapartidas que hay que conocer (y decir en la defensa):
- **Se duerme a los 15 min** sin peticiones HTTP ni mensajes WebSocket entrantes. El primer acceso tras dormir tarda ~1 min. La app móvil (Fase 8) debe: usar un timeout largo en la primera petición, mostrar "despertando el servidor", y enviar `{"type":"PING"}` periódico (menos de cada 15 min) mientras está en primer plano. NO PROBADO que un PING de aplicación cuente como "mensaje entrante" (la doc dice "WebSocket message"; lo razonable es que sí).
- Mientras duerme, el listener de Supabase está caído: los cambios de ese periodo no generan avisos. No se pierde nada porque la BD es la fuente de verdad y la app pide el estado por REST al reconectar (ya existe `RESYNC_REQUIRED` tras cada recuperación del listener).
- Sin escalado, sin discos persistentes, sin SSH; salida SMTP bloqueada (no usamos). Todo VERIFICADO en la doc.
- Para la demo: despertar el servicio 2-3 minutos antes con `scripts/deploy/check_deploy.py`.

## 3. Qué hay preparado en el repo

- `render.yaml` (raíz): servicio web `ea-fc-api`, plan `free`, `rootDir: backend`, build `pip install -r requirements.txt`, arranque `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (el comando de la guía oficial de FastAPI de Render), `healthCheckPath: /health`. Las 3 claves de Supabase van con `sync: false`: Render las pide en el panel al crear el Blueprint y **no están en el repo**.
- `PYTHON_VERSION=3.12.0` en `render.yaml`: Render usa por defecto 3.14.3 (servicios creados desde 2026-02-11) y nuestras dependencias se probaron con 3.12.0 (ver `docs/VERSIONES.md`). Requiere versión completa (x.y.z) en la variable. NO PROBADO que Render ofrezca exactamente 3.12.0; si el build falla por eso, cambiar a la última 3.12.x.
- `scripts/deploy/check_deploy.py`: comprueba `/health` por HTTPS (mide arranque en frío), el upgrade a `wss://…/ws`, que un cliente anónimo recibe `4401 AUTH_REQUIRED`, y (con contraseña) login + `AUTH_OK` + `PING→PONG`.
- `backend/.env` NO se despliega (ignorado por git); `Settings` acepta variables de entorno reales.
- Región en `render.yaml`: `frankfurt` (opciones documentadas: oregon, ohio, virginia, frankfurt, singapore). Mejor la más cercana a tu proyecto de Supabase.

### Comprobado en local (VERIFICADO)
Copia de lo commiteado (`git archive`), venv nuevo con Python 3.12.0, `pip install -r requirements.txt` (45 s), SIN `.env` en disco y con las variables solo en el entorno, arranque con el comando exacto de Render en el puerto 8765: listener suscrito, `check_deploy.py` con y sin login: todo OK (`AUTH_OK`, `PONG` en 1 ms). Es Windows, no Linux: NO PROBADO en el Linux de Render.

## 4. Guía paso a paso (tú haces lo marcado con 👤)

1. 👤 **Subir el repo a GitHub** (Render despliega desde un repositorio Git). Ahora mismo el repo no tiene `remote`. Crea un repo vacío (puede ser privado) en GitHub, sin README. Luego, en la raíz del proyecto:
   ```
   git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
   git push -u origin master
   ```
   Antes de empujar, `render.yaml` y `scripts/deploy/` deben estar commiteados (los commitea el cierre de fase, o dímelo antes y lo hago).
2. 👤 **Cuenta en Render** (render.com), entra con GitHub y autoriza el acceso al repo.
3. 👤 **New → Blueprint**, elige el repo y la rama que empujaste. Render lee `render.yaml` y te pide los 3 valores secretos. Cópialos de tu `backend/.env` **directamente al panel** (no los pegues en el chat): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Si en el asistente aparece una pantalla para añadir tarjeta, avísame antes de seguir.
4. 👤 Espera el primer despliegue (pestaña Logs). Esperado: `pip install` y luego `Uvicorn running…` y `realtime listener subscribed`. Si falla, pégame el final del log (sin secretos).
5. 👤 Copia la URL pública (`https://ea-fc-api….onrender.com`) y ejecuta desde la raíz:
   ```
   backend\venv\Scripts\python.exe scripts\deploy\check_deploy.py https://TU-URL.onrender.com
   ```
   (el paso de login usa `DEMO_PARTICIPANT_PASSWORD` de `scripts/demo/demo.env`; añade `--skip-login` para omitirlo).
6. Pásame la salida y completo la sección 5 con lo medido.
7. 👤 Anota la URL: en la Fase 8 será `EXPO_PUBLIC_API_URL`.

Notas del panel de Render: `sync: false` solo se pregunta al CREAR el Blueprint; si luego cambias una clave, edítala en Environment del servicio. Para parar el servicio (y las horas gratis), Suspend en el panel.

## 5. Resultado del despliegue real

PENDIENTE: se rellena tras ejecutar la guía (URL pública sin secretos, salida de `check_deploy.py`, tiempo de arranque en frío medido, comprobación de que se duerme).

## 6. Fuentes

- Render, límites del plan gratuito: https://render.com/docs/free
- Render, changelog 2026-02-24 (WebSocket cuenta como actividad): https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages
- Render, servicios web (puerto, TLS): https://render.com/docs/web-services
- Render, versión de Python: https://render.com/docs/python-version
- Render, Blueprint spec: https://render.com/docs/blueprint-spec
- Render, guía FastAPI: https://render.com/docs/deploy-fastapi
- Cloud Run, WebSockets: https://docs.cloud.google.com/run/docs/triggering/websockets
- Google Cloud, límites Always Free: https://docs.cloud.google.com/free/docs/free-cloud-features
- Koyeb, instancias: https://www.koyeb.com/docs/reference/instances ; escala a cero: https://www.koyeb.com/docs/run-and-scale/scale-to-zero
- Fly.io (solo fuentes de terceros): https://costbench.com/software/cloud-infrastructure/fly-io/free-plan/
