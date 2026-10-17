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
- El BFF (`web-tienda/src/lib/api.ts`) usa ese slug por petición y pide un token
  de tienda con la llave de plataforma (`POST /public/storefront/token`, ver
  ADR 026). El token solo hace lo que hace un comprador y se cachea por slug.
  Sin host resuelto (o en localhost) cae al tenant por env.

## Variables de entorno

| Var | Dónde | Para qué |
|-----|-------|----------|
| `STOREFRONT_APEX` | API | Apex de subdominios de plataforma. Decisión 2026-07-22: `shop.angaes.com`. Si se define, el subdominio del tenant se registra como host verificado. |
| `STOREFRONT_CNAME_TARGET` | API | Destino CNAME recomendado al dueño (default `stores.gaessoft.mx`). |
| `STOREFRONT_SERVICE_KEY` | API **y** web-tienda | Llave de plataforma (≥32 caracteres, la misma en ambos). Con ella la tienda web obtiene el token de tienda de cualquier negocio. Sin ella el API responde 503 y ninguna tienda carga. |
| `TIENDA_TENANT_SLUG` | web-tienda | Tenant que se muestra cuando el host no resuelve a ninguna tienda. |

## Activación en producción (decisión 2026-07-22: `shop.angaes.com`)

Las tiendas de los tenants viven en `<slug>.shop.angaes.com` reutilizando el
dominio ya comprado (angaes.com, Hostinger). Tres pasos, una sola vez:

1. **Railway** (servicio web-tienda): variable `STOREFRONT_APEX=shop.angaes.com`
   en el API, y en el servicio de tienda agregar el Custom Domain comodín
   `*.shop.angaes.com` (Railway da un CNAME target).
2. **Hostinger** (DNS de angaes.com): crear el CNAME comodín
   `*.shop → <target de Railway>` (mismo target que ya usa `shop`).
3. **Backfill** (registra las tiendas ya configuradas; idempotente y nunca le
   quita a un negocio una dirección que ya es de otro): `./scripts/prod-dominios-tienda.sh`.
   Con el apex puesto, guardar la tienda en el panel también registra su dirección.

`shop.angaes.com` sin subdominio sigue sirviendo el tenant por env
(`TIENDA_TENANT_SLUG`), igual que hoy.

## Validación de infraestructura por dominio

3. **SSL + DNS**: emisión automática de certificado por dominio y apuntado real
   (Cloudflare for SaaS / "Custom Domains" de Railway / wildcard). El CNAME target
   debe existir y terminar la conexión TLS para cada dominio del cliente.
4. **Deploy**: una instancia de web-tienda multi-tenant detrás de ese CNAME, con
   `STOREFRONT_SERVICE_KEY` (resuelto en ADR 026: sin credenciales por tenant).

### Dominio existente de Gaesland

La comprobación pública adicional verificó que `gaesland.shop.angaes.com` ya
resuelve por CNAME, responde por HTTPS con certificado válido y devuelve la
configuración del negocio **GAESLAND**. Un hostname aleatorio no asignado bajo
el comodín devuelve 503 y no muestra otro negocio.

```sh
node scripts/testing/check-live-shop-domain.cjs
```

El script solo consulta DNS y endpoints públicos; no cambia producción. Esto
confirma el dominio de plataforma existente. La configuración `dominioPropio`
de Gaesland staging sigue vacía: un dominio externo de marca requiere sus
propios registros y certificado. La prueba del dominio no certifica el checkout
ni que el último código de staging esté desplegado en ese sitio público.
