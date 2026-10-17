# Validación de pagos y CFDI en pruebas

Este documento corresponde al flujo actual de tienda. Probar una suscripción SaaS
no valida el cobro de un pedido: usan rutas y secretos de webhook separados.

## Stripe: suscripción y cobros de cada tienda

Las variables privadas pertenecen al servicio API, nunca al frontend ni a una APK:

| Variable de API | Uso |
| --- | --- |
| `STRIPE_API_KEY` | Credencial privada del proveedor. |
| `STRIPE_PUBLISHABLE_KEY` | Llave pública para el formulario de tarjeta. |
| `STRIPE_WEBHOOK_SECRET` | Firma del webhook de suscripciones. |
| `STRIPE_COMMERCE_WEBHOOK_SECRET` | Firma de eventos de pedidos de la plataforma. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Firma de eventos de cuentas conectadas. |

Rutas actuales:

- Suscripciones: `/webhooks/stripe`.
- Pedidos, incluidos eventos Connect: `/webhooks/stripe/commerce`.
- `/billing/webhook` es un simulador exclusivo de desarrollo/test; no debe existir
  en el despliegue de staging ni en producción.

El dueño conecta su comercio desde **Mi suscripción → Cobros a tus clientes
(Stripe) → Continuar registro**. Tener las llaves de plataforma no termina el
registro del comercio. Mientras Stripe no habilite los cobros de su cuenta, la
configuración pública no debe ofrecer tarjeta ni publicar una llave para cobrar.
Pagar al recoger sigue siendo un pedido sin cobro online; no acredita dinero.

## Conekta, si el negocio elige ese proveedor

La API utiliza `CONEKTA_API_KEY`, `CONEKTA_PUBLIC_KEY` y
`CONEKTA_WEBHOOK_SECRET`. El webhook actual es `/webhooks/conekta`.
La llave pública llega a web y móvil mediante la configuración de pago de la
API; `NEXT_PUBLIC_CONEKTA_PUBLIC_KEY` no sustituye esa configuración actual.

El proveedor se selecciona por negocio. La API calcula los métodos que puede
ofrecer y ambos clientes deben respetarlos. La ausencia de proveedor no habilita
un cobro simulado en producción. Los mocks requieren un ambiente de pruebas y
la autorización explícita correspondiente.

## Facturación del negocio

El dueño configura **Facturación** con permiso `cfdi.configurar`: datos del emisor,
ambiente y credencial de Facturama. Los roles con `cfdi.leer` pueden consultar los
datos públicos de esa configuración, sin recibir su llave ni poder modificarla.

Antes de certificar el recorrido externo, hace falta una cuenta sandbox y un
emisor válido para ella. La prueba debe comprobar emisión, PDF/XML, consulta del
estado y cancelación admitida por el proveedor. Las pruebas con un cliente mock
no sustituyen ese recorrido. La facturación de las suscripciones SaaS tiene su
propio alcance; ver [validación de plataforma](testing-platform-workflows.md).

## Estado comprobado de Gaesland staging — 16 de octubre de 2026

- Stripe Connect vinculado, con estado pendiente: registro sin enviar y cobros y
  depósitos deshabilitados. Faltan campos de domicilio y aceptar términos.
- El checkout público no anuncia tarjeta mientras la cuenta no esté habilitada.
- Webhooks Stripe sin firma o con firma inválida: rechazados con 401.
- Webhook de simulación `/billing/webhook`: 404 en el despliegue.
- Sin configuración de emisor fiscal del negocio: no se certificó timbrado externo.

Se pueden repetir las comprobaciones públicas, sin credenciales ni pagos, con:

```sh
node scripts/staging/check-payment-boundaries.cjs
```

El script tiene destinos fijos de staging. Para la evidencia completa y los límites
restantes, ver [validación de roles y tienda](testing-release-roles.md).
