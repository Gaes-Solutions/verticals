# Estado de tarjeta en app Cliente y separación de cuentas — 8-sep-2026

Auditoría de código y documentación primaria. No es decisión aceptada ni certificación; no se instalaron paquetes, consultaron secretos o realizaron cargos. Está pendiente respuesta de Gaby sobre cuenta propia por comercio frente a recepción por GaesSoft. No asumir un modelo de recaudación.

## Estado local

Web usa Conekta.js y NEXT_PUBLIC_CONEKTA_PUBLIC_KEY, envía cardTokenId al backend. Móvil ofrece OXXO/SPEI: esquema rechaza tarjeta/cardTokenId y response filtra clientSecret. Conekta crea cargos /orders; Stripe crea PaymentIntents. Ninguno implementa checkout alojado. Conekta agrupa estados distintos de paid como pendiente; falta contrato de acción adicional/3DS antes de habilitar tarjeta.

Las llaves privadas Conekta/Stripe son variables globales del proceso en plugins/pagos.ts. Seleccionar proveedor por ConfigTienda no acredita cuentas comerciales separadas. Stripe tiene soporte Connect en otras rutas, pero la fachada móvil no lo integra. Definir recaudación antes de resolver llaves por tenant.

## Dependencias verificadas

- SDK oficial conekta-elements-react-native: registro npm público devuelve0.0.1 y coincide package.json oficial. ConektaTokenizer recibe publicKey/merchantName y entrega token,lastFour. El token se usa como cardTokenId. Development/EAS builds soportados, Expo Go no. Compatibilidad concreta Expo53/RN0.79.6/New Architecture requiere compilación y prueba. Hay discrepancia en requisitos iOS14 del wrapper frente a15 del SDK nativo: validar artefacto fijado. [SDK](https://developers.conekta.com/docs/checkout-tokenizer-sdk), [repositorio](https://github.com/conekta/conekta-elements-react-native), [manifest](https://raw.githubusercontent.com/conekta/conekta-elements-react-native/main/package.json).
- Stripe: Expo53.0.27 instalado declara @stripe/stripe-react-native0.45.0 en bundledNativeModules.json. PaymentSheet necesita secreto del intento del propietario, clave pública y retorno configurado. La versión más nueva documentada actualmente no sustituye esta compatibilidad. [Expo](https://docs.expo.dev/guides/new-architecture/), [Stripe](https://docs.stripe.com/payments/mobile/accept-payment?platform=react-native).
- Alternativa Conekta HostedPayment: orden con checkout.type, redirección a checkout.url, URLs de retorno configuradas y métodos habilitados en panel. Requiere adaptador nuevo; no se deduce enlace del token. Confirmar mediante webhook, jamás callback o URL. [Contrato](https://developers.conekta.com/docs/componente-de-pago).

## Propuesta pendiente

Priorizar prueba de integración SDK Conekta por ajuste al contrato existente. Luego ampliar pago-config con capacidad/llave pública del comercio verificado y POST tarjeta con token obligatorio. Conservar UUID, snapshot y recovery. No persistir PAN/CVV/token ni volver a tokenizar por respuesta ambigua. Stripe exige ampliar response autenticada para clientSecret y resolver Connect/cuenta. Hosted checkout es otra integración, no fallback implícito.

Verificar externamente: cuenta y métodos habilitados, pares de llaves del mismo entorno/comercio, endpoint HTTPS y autenticidad del webhook, builds Android/iOS y 3DS. No se revisaron secretos; no se afirma que falten físicamente. Pruebas necesarias: token inválido, rechazo, cancelación, timeout antes/después del cargo, desafío, webhook duplicado, retorno falso y recuperación tras reiniciar. Falta certificación real de proveedor/dispositivos.
