# Validación proactiva del proceso local

El estado `idle` indica que no hay incidentes aprobados; no certifica pruebas. El estado muestra por separado `releaseAudit` y `health`.

## Auditoría sin consumo de IA

La matriz confiable `automation/release-audit-matrix.json` exige 19 grupos: compilaciones web, tipos del monorepo, lint delimitado, API unitaria y API con PostgreSQL desechable, paquetes, otras superficies, seguridad de automatizaciones, utilidades Node, unidades web y móviles, navegación controlada y flujos de plataforma, comercio y comprador. Se ejecuta ante un commit o política nuevos y cada 24 horas; si falla o queda incompleta reintenta después de una hora. No depende de incidentes aprobados ni de cupo del modelo. Cada ciclo dedica primero su presupuesto a esa auditoría y retoma incidentes en ciclos siguientes.

Se instala desde un checkout limpio en contenedores nuevos, con datos sintéticos, sin claves de proveedores ni sesión personal. El reporte incremental conserva los checks no ejecutados como pendientes; un timeout, reporte incompleto o evidencia inválida impide dar verde. Los hallazgos y su resolución quedan en archivos privados con primera/última detección, contador y hash del log. Esto detecta regresiones cubiertas por las pruebas existentes; no constituye cobertura exhaustiva de todos los casos posibles.

Un timer independiente revisa cada diez minutos siete comprobaciones de disponibilidad de staging, incluida la denegación del endpoint administrativo sin autenticación. No consume IA ni envía correos. Conserva hallazgos y recuperaciones independientemente del worker.

## Correcciones revisadas

En el worker local, cada parche requiere el perfil completo de validación antes del auditor y de crear un PR borrador hacia staging. La evidencia queda ligada al commit, al parche y al reporte. No se hace merge automático ni despliegue de producción. Una publicación con confirmación pendiente se guarda antes de comunicarla al servidor; se reintenta la misma confirmación, sin reportarla falsamente como una corrección fallida ni reclamar otro incidente. Una publicación ambigua bloquea nuevas reclamaciones para revisión.

## Límites explícitos

Los ocho requisitos manuales permanecen pendientes: hardware, APK en dispositivos físicos, pagos reales/3DS, CFDI real, entrega real de correo, DNS/TLS de dominio propio, despliegue/rollback y restauración de respaldos productivos. Las simulaciones no aprueban estos requisitos. `releaseReady` permanece falso. Los tokens locales no se copian a los contenedores de pruebas. La IA conserva autenticación de ChatGPT, sin fallback a una API de pago.

El timer requiere que esta PC esté encendida y su gestor de usuario disponible. Los límites de suscripción pueden pausar correcciones con IA; no pausan las comprobaciones independientes.
