# 🚂 Deploy en Railway — Runbook GaesSoft

Guía para llevar GaesSoft a producción en **Railway** (en vez de Hetzner+Coolify del ADR original).
Railway no usa `docker-compose`: cada app es un **servicio** propio que Railway construye desde su
`Dockerfile`, más dos **plugins** gestionados (Postgres y Redis).

> Reglas de seguridad: las API keys y contraseñas las pega **Gaby** en el panel de Railway. Claude
> nunca captura secretos. Este doc dice QUÉ poner y DÓNDE, no contiene valores reales.

---

## 0. Arquitectura en Railway

Un proyecto Railway con:

| Componente        | Tipo            | Notas |
|-------------------|-----------------|-------|
| **Postgres**      | Plugin Railway  | Una sola BD; multi-tenant por schema. Da `DATABASE_URL`. |
| **Redis**         | Plugin Railway  | Da `REDIS_URL`. |
| **api**           | Servicio (Dockerfile `apps/api/Dockerfile`) | Fastify. Escucha en `$PORT`. |
| **web-admin**     | Servicio (`apps/web-admin/Dockerfile`)      | SPA nginx. Proxy `/api` → api. |
| **web-pos**       | Servicio (`apps/web-pos/Dockerfile`)        | SPA nginx. |
| **web-superadmin**| Servicio (`apps/web-superadmin/Dockerfile`) | SPA nginx (TU consola). |
| **web-tienda**    | Servicio (`apps/web-tienda/Dockerfile`)     | Next.js standalone. |

Las SPAs llaman al API **same-origin** vía `/api` (nginx proxea al servicio `api` por red privada),
así no hay líos de CORS. El upstream se inyecta con la variable `API_UPSTREAM`.

---

## 1. Prerrequisitos

1. **Repo en GitHub** (hoy NO hay remote configurado). Crear repo privado y subir:
   ```bash
   git remote add origin git@github.com:<org>/gaespos.git
   git push -u origin <rama>   # idealmente fusionar a main primero
   ```
   Railway despliega desde GitHub, así que esto es bloqueante.
2. **Dominio** (lo tienes). Ej.: `gaespos.mx`. Definir subdominios:
   - `app.gaespos.mx` → web-admin
   - `pos.gaespos.mx` → web-pos
   - `admin.gaespos.mx` → web-superadmin
   - `tienda.gaespos.mx` (o el dominio del cliente) → web-tienda
   - `api.gaespos.mx` → api (público, para webhooks de pagos/paqueterías)
3. Cuentas de proveedores con sus llaves (ver §6).

---

## 2. Crear el proyecto + plugins

1. Railway → **New Project** → **Deploy from GitHub repo** → elegir `gaespos`.
2. **Add → Database → PostgreSQL**. Anota que expone `DATABASE_URL`.
3. **Add → Database → Redis**. Expone `REDIS_URL`.

---

## 3. Servicio `api`

1. **New Service → GitHub repo** (el mismo). Settings:
   - **Build**: Dockerfile. **Dockerfile Path** = `apps/api/Dockerfile` (contexto = raíz del repo).
   - **Networking → Public Domain**: genera uno y luego mapea `api.gaespos.mx`.
   - **Target Port**: `3000`.
2. **Variables** (Settings → Variables). Usar referencias a los plugins con `${{...}}`:
   ```
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   DATABASE_URL_MASTER=${{Postgres.DATABASE_URL}}?schema=public
   DATABASE_URL_TENANT=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   JWT_SECRET=<openssl rand -hex 32>
   JWT_REFRESH_SECRET=<otro distinto>
   COOKIE_SECRET=<otro distinto>
   CORS_ORIGIN=https://app.gaespos.mx
   SEED_ADMIN_EMAIL=admin@gaessoft.local
   SEED_ADMIN_PASSWORD=<fuerte>
   FLOWS_SCHEDULER_ENABLED=true
   FLOWS_RUN_INTERVAL_MIN=360
   ```
   Más **todas las llaves de proveedores** de §6 (las que tengas listas).
   > `CORS_ORIGIN` admite varios orígenes separados por coma si el código lo soporta; si no, apunta
   > al que más uses y agrega los demás cuando definas dominios.

---

## 4. Migraciones + seed (one-off, una vez)

El contenedor del API **no** migra solo. Tras el primer deploy del `api`, abre una shell del
servicio (Railway → api → **⋯ → Shell**, o `railway run` con la CLI) y corre:

```bash
# 1. Migraciones del master (crea tablas públicas: tenants, plans, admin, etc.)
pnpm --filter @gaespos/db prisma:migrate:deploy

# 2. Seed del master (admin superusuario + planes base)
pnpm --filter @gaespos/db seed:master

# 3. Alta de cada negocio (crea schema tenant_<slug> + migraciones + defaults + usuario dueño)
pnpm --filter @gaespos/db migrate tenant onboard <slug> -n "Nombre Negocio" -e dueno@correo.com
```

> Si la imagen prod no trae los devDeps de la CLI, corre estos comandos con `railway run` desde tu
> máquina (usa el `DATABASE_URL` de Railway). Alternativa: añadir un *pre-deploy command* en Railway
> que ejecute el paso 1.

Cambia la contraseña del admin tras el primer login en `admin.gaespos.mx`.

---

## 5. Servicios frontend

Para **web-admin**, **web-pos**, **web-superadmin** (idéntico, cambia el Dockerfile path):

1. New Service → GitHub repo. **Dockerfile Path** = `apps/web-admin/Dockerfile` (etc.).
2. **Target Port**: `80` (nginx).
3. **Variables**:
   ```
   API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:3000
   ```
   Esto hace que nginx proxee `/api` → el API por la red privada de Railway.
4. **Networking → Custom Domain**: `app.gaespos.mx` / `pos.gaespos.mx` / `admin.gaespos.mx`.

Para **web-tienda** (Next.js):

1. New Service → GitHub repo. **Dockerfile Path** = `apps/web-tienda/Dockerfile`. **Target Port** `3001`.
2. **Variables**:
   ```
   NODE_ENV=production
   PORT=3001
   API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3000
   TIENDA_TENANT_SLUG=<slug del negocio de la tienda>
   TIENDA_USER_EMAIL=<usuario de servicio del tenant>
   TIENDA_USER_PASSWORD=<password de ese usuario>
   NEXT_PUBLIC_CONEKTA_PUBLIC_KEY=<llave pública Conekta>
   ```
3. Custom Domain: `tienda.gaespos.mx` (o el dominio propio del cliente).

---

## 6. Llaves de proveedores (van en el servicio `api`)

Plantilla completa en [`.env.prod.example`](../.env.prod.example). Resumen de lo elegido (ambas
pasarelas + las 4 integraciones):

| Proveedor | Variables | Dónde se obtiene |
|-----------|-----------|------------------|
| **Conekta** | `CONEKTA_API_KEY`, `CONEKTA_WEBHOOK_SECRET`, `NEXT_PUBLIC_CONEKTA_PUBLIC_KEY` (en web-tienda) | Dashboard Conekta → API Keys + Webhooks |
| **Stripe** | `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` | Dashboard Stripe → Developers |
| **Facturama (CFDI)** | *por negocio* — cada tenant captura su llave en web-admin → Facturación. NO va en env. | Cuenta Facturama |
| **Resend (email)** | `RESEND_API_KEY`, `EMAIL_REMITENTE` | Resend → API Keys + verificar dominio `gaespos.mx` |
| **WhatsApp Cloud** | `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_ID` | Meta for Developers → WhatsApp (token permanente) |
| **Skydropx / Envía** | `SKYDROPX_API_KEY`+`SKYDROPX_WEBHOOK_SECRET` y/o `ENVIA_API_KEY`+`ENVIA_WEBHOOK_SECRET` | Cuentas Skydropx / Envía |
| **Push web (VAPID)** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Generar: `npx web-push generate-vapid-keys` |

Cualquier llave vacía → ese proveedor cae a su **mock** (no cobra/envía de verdad). La pasarela
real por negocio se elige en **web-admin → Tienda online → Pasarela de pago** (Conekta o Stripe).

**Webhooks** (configurar en cada proveedor apuntando a `https://api.gaespos.mx`):
- Conekta/Stripe → el endpoint de webhook de checkout (`/t/checkout/webhook` vía el flujo de tienda).
- Skydropx/Envía → su endpoint de tracking correspondiente.

---

## 7. DNS

En tu proveedor de DNS, por cada subdominio crea el registro **CNAME** que Railway te indica al
agregar el Custom Domain (Railway da un target tipo `xxx.up.railway.app`). Espera propagación + SSL
automático de Railway.

---

## 8. Checklist de go-live

- [ ] Repo en GitHub + push.
- [ ] Proyecto Railway + Postgres + Redis.
- [ ] Servicio `api` desplegado (healthcheck `/health` verde).
- [ ] Migraciones master + seed master corridos.
- [ ] Al menos 1 tenant dado de alta (`tenant onboard`).
- [ ] 4 servicios frontend desplegados con su `API_UPSTREAM` / `API_URL`.
- [ ] Dominios + SSL en los 5 servicios.
- [ ] Llaves de proveedores cargadas (las que apliquen) + `FLOWS_SCHEDULER_ENABLED=true`.
- [ ] Pasarela de pago elegida por negocio en web-admin.
- [ ] Webhooks de pagos/paqueterías apuntando a `api.gaespos.mx`.
- [ ] Prueba real: 1 venta POS, 1 compra en tienda (pago real chico), 1 CFDI timbrado, 1 email.
- [ ] Cambiar password del admin superusuario.

---

## 9. Notas

- **Imágenes GHCR**: el CI (`.github/workflows/main.yml`) ya buildea y publica a GHCR. En Railway
  no hace falta (Railway buildea desde el repo), pero el CI sirve de validación/artefacto.
- **Backups**: activar backups del plugin Postgres de Railway (o `pg_dump` programado a B2/S3).
- **Escala**: Railway escala por servicio; el `api` es el que más conviene vigilar (CPU/mem).
- **`docker-compose.prod.yml`** queda como alternativa si algún día migras a un VPS propio; ya lleva
  el passthrough de todas las llaves.
