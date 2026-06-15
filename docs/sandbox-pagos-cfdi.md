# 🧪 Sandbox — Pagos (Conekta) y Facturación (Facturama)

> Cómo conectar y probar **cobros reales** y **timbrado CFDI** en modo prueba,
> sin tocar dinero ni timbres reales. Cuando funcione en sandbox, pasar a prod es
> cambiar llaves + ambiente. El código ya está listo: esto es solo "pegar llaves".

---

## 💳 Conekta (pagos de la tienda) — llaves **globales** (env)

Conekta es, en V1, una integración **a nivel plataforma** (una cuenta para la
tienda). El cobro por tenant con cuentas separadas (Conekta/Stripe Connect) es V1.5.

### Pasos
1. Crear cuenta en https://conekta.com → activar **modo prueba** (toggle test).
2. En **Desarrolladores → API Keys** (modo prueba), copiar:
   - **Llave privada de prueba** → `CONEKTA_API_KEY` (backend / API)
   - **Llave pública de prueba** → `NEXT_PUBLIC_CONEKTA_PUBLIC_KEY` (tienda)
3. En **Webhooks** crear un endpoint apuntando a `https://<api>/t/checkout/webhook`
   y copiar el secreto → `CONEKTA_WEBHOOK_SECRET`.
   - En local, exponer la API con un túnel (`cloudflared tunnel` o `ngrok http 3000`)
     y registrar esa URL pública en Conekta.
4. Poner las vars en `.env` (API) y en el env del contenedor de la tienda
   (o `apps/web-tienda/.env.local` en dev). Reiniciar API + tienda.

### Cómo se comporta
- **Sin** `NEXT_PUBLIC_CONEKTA_PUBLIC_KEY`: la tienda usa el flujo demo (mock, sin cobro).
- **Con** la llave pública: el checkout muestra el formulario de tarjeta de Conekta.js
  (la tarjeta nunca toca nuestro backend; se envía solo el token — PCI).
- El cargo se crea con el token; **MSI** aparece si el total ≥ el mínimo configurado
  por el tenant (Admin → Tienda → Funciones).
- El webhook `order.paid` confirma el pedido y genera la venta (descuenta stock).

### Probar
- Tarjeta de prueba Conekta: **4242 4242 4242 4242**, fecha futura, cualquier CVV.
- Verificar: el pedido pasa a `pago_confirmado`, se genera la venta y baja el stock.
- MSI: usar un total ≥ mínimo y elegir un plazo (3/6/12…).

---

## 🧾 Facturama (CFDI 4.0) — config **por tenant** (UI)

Facturama es **por tenant**: cada negocio pone su API key + ambiente desde el
panel. La UI ya existe: **web-admin → Facturación** (permiso `cfdi.configurar`).

### Pasos
1. Crear cuenta **sandbox** en https://facturama.mx (apisandbox.facturama.mx) y
   obtener la **API key de pruebas**.
2. En **web-admin → Facturación**:
   - **Datos del emisor**: RFC, razón social, régimen SAT (ej. `601`), CP, serie.
     - Para pruebas, Facturama provee RFCs de demo con CSD precargado
       (RFC genérico SAT de pruebas: `EKU9003173C9`). Verificar el vigente en la
       doc de Facturama sandbox.
   - **Ambiente**: `Sandbox (pruebas)`.
   - **API key de Facturama**: pegar la de pruebas. Guardar.
3. (La app usa automáticamente `https://apisandbox.facturama.mx` en sandbox y
   `https://api.facturama.mx` en prod — sin tocar código.)

### Probar
- Hacer una venta en el POS (`web-pos`) y **emitir CFDI** → debe timbrar y
  devolver UUID de prueba + PDF/XML.
- **Autofactura**: si está activa, el cliente factura su ticket desde la tienda
  con su RFC. La factura self-service del pedido online ya usa este mismo flujo.

### Pasar a producción
1. Cuenta Facturama de **producción** + subir el **CSD real** del cliente
   (.cer/.key + contraseña) en el panel de Facturama (no se guarda en GaesSoft).
2. En **web-admin → Facturación**: cambiar **Ambiente → Producción**, pegar la
   **API key de producción**, verificar RFC/razón social/régimen reales. Guardar.
3. Emitir un CFDI de prueba real (a `XAXX010101000`) y validar el UUID en el SAT.

---

## Resumen de variables / dónde van

| Qué | Dónde | Variable / lugar |
|-----|-------|------------------|
| Conekta privada (test) | API (env) | `CONEKTA_API_KEY` |
| Conekta webhook secret | API (env) | `CONEKTA_WEBHOOK_SECRET` |
| Conekta pública (test) | Tienda (env) | `NEXT_PUBLIC_CONEKTA_PUBLIC_KEY` |
| Facturama API key + ambiente | Por tenant (UI) | web-admin → Facturación |

> Ver `.env.example` para el bloque completo de variables de pagos.
