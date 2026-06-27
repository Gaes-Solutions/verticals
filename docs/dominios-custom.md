# Dominios propios de la tienda (custom domains)

Cada cliente (tenant) puede usar su propio dominio para su tienda online en vez
del subdominio de la plataforma. Configurable por el dueño desde **web-admin →
Tienda → Dominio propio**; el sistema le recomienda los registros DNS.

## Cómo funciona (Piezas 1 y 2 — hechas)

### Pieza 1 — App (configurar + verificar)
- El dueño escribe su dominio (ej. `tienda.minegocio.com`) y guarda.
- El backend genera un token y registra el mapeo `host → tenant` en la master DB
  (`tienda_dominios`).
- El sistema recomienda dos registros DNS (`GET /t/ecommerce/dominio`):
  - **CNAME** `tienda.minegocio.com → ${STOREFRONT_CNAME_TARGET}` (enruta el tráfico).
  - **TXT** `_gaessoft-verify.tienda.minegocio.com = gaessoft-verify=<token>` (prueba la propiedad).
- `POST /t/ecommerce/dominio/verificar` lee el TXT por DNS y marca el dominio
  como verificado.

### Pieza 2 — Routing por hostname
- `GET /public/storefront/resolve?host=` resuelve `host → tenantSlug` (solo hosts
  verificados).
- `web-tienda/src/middleware.ts` lee el `host` de la petición, resuelve el slug y
  lo fija en el header `x-tienda-slug`.
- El BFF (`web-tienda/src/lib/api.ts`) usa ese slug por petición y hace login con
  la cuenta de servicio del tenant correspondiente (token cacheado por slug). Sin
  host resuelto (o en localhost) cae al tenant por env: el deployment de una sola
  tienda sigue funcionando igual.

## Variables de entorno

| Var | Dónde | Para qué |
|-----|-------|----------|
| `STOREFRONT_APEX` | API | Apex de subdominios de plataforma (ej. `gaessoft.shop`). Si se define, el subdominio del tenant se registra como host verificado. |
| `STOREFRONT_CNAME_TARGET` | API | Destino CNAME recomendado al dueño (default `stores.gaessoft.mx`). |
| `TIENDA_SERVICE_ACCOUNTS` | web-tienda | JSON `{"slug":{"email":"..","password":".."}}` con la cuenta de servicio por tenant, para servir varias tiendas por dominio desde un mismo deployment. Si falta un slug, usa `TIENDA_USER_EMAIL/PASSWORD`. |
| `TIENDA_TENANT_SLUG` / `TIENDA_USER_EMAIL` / `TIENDA_USER_PASSWORD` | web-tienda | Tenant + credenciales por defecto (deployment de una sola tienda). |

## Lo que falta (Piezas 3 y 4 — requieren infra/decisión de Gaby)

3. **SSL + DNS**: emisión automática de certificado por dominio y apuntado real
   (Cloudflare for SaaS / "Custom Domains" de Railway / wildcard). El CNAME target
   debe existir y terminar la conexión TLS para cada dominio del cliente.
4. **Deploy**: una instancia de web-tienda multi-tenant detrás de ese CNAME, con
   `TIENDA_SERVICE_ACCOUNTS` poblado (o un esquema de credenciales por tenant).

Hasta cerrar 3 y 4, el flujo end-to-end no enruta tráfico real de un dominio
externo; las Piezas 1 y 2 dejan toda la lógica de aplicación lista y probada.
