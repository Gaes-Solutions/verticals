# Validación proactiva del proceso local

El estado `idle` indica que no hay incidentes aprobados; no certifica pruebas. El estado muestra por separado `releaseAudit` y `health`.

## Auditoría sin consumo de IA

La matriz confiable `automation/release-audit-matrix.json` exige 21 grupos: compilaciones web, tipos del monorepo, lint delimitado, API unitaria y API con PostgreSQL desechable, paquetes, otras superficies, seguridad de automatizaciones, utilidades Node, unidades web y móviles, navegación controlada y flujos de plataforma, comercio y comprador. Se ejecuta ante un commit o política nuevos y cada 24 horas; si falla o queda incompleta reintenta después de una hora. No depende de incidentes aprobados ni de cupo del modelo. Si un aviso de PR sigue pendiente de entrega, el controlador reintenta el aviso y conserva el bloqueo de nuevos trabajos, pero permite la auditoría determinista que corresponda. Cada ciclo dedica primero su presupuesto a esa auditoría y retoma incidentes en ciclos siguientes.

El escenario `shopper-order-e2e` agrega una compra invitada por la tienda real, con recogida y pago al recoger: confirma el pedido en el navegador, verifica la persistencia e idempotencia en PostgreSQL y que el carrito quede vacío. Mantiene separados los recorridos de sólo lectura y sus invariantes. No simula las respuestas de checkout ni cobra/envía correos reales.

El escenario `owner-onboarding-e2e` parte de cero tiendas y registra al dueño desde la interfaz pública. Recorre bienvenida móvil, dirección/contacto, personal, catálogo y foto real, recuperación de un fallo de existencias, mayoreo, primera venta en efectivo, publicación, recogida, restricciones del cajero, instrucciones de dominio y 2FA. Después completa una compra de recogida en esa misma tienda, con PostgreSQL y almacenamiento de fotos privados y desechables. No prueba DNS real, hardware ni entrega real de correo.

Se instala desde un checkout limpio en contenedores nuevos, con datos sintéticos, sin claves de proveedores ni sesión personal. PostgreSQL es desechable en RAM (máximo 2 GiB de datos y 3 GiB de memoria del contenedor); esto no comprueba durabilidad de almacenamiento. Los navegadores usan un HOME temporal privado montado desde el directorio de la ejecución, y los fixtures ejecutables usan `/qa-temp`; el resto de `/tmp` conserva `noexec`. La inspección multimedia conserva bubblewrap real mediante un puente local limitado a los dos comandos exactos de ffprobe/ffmpeg. El puente comprueba el UID del cliente, fija el archivo por descriptor sin seguir enlaces, solo lee archivos sintéticos dentro de `/qa-temp`, limita CPU/memoria/salida y ejecuta el decodificador sin red ni acceso al HOME. No expone Docker ni ejecuta scripts del repositorio en la PC. El puente termina al cerrar el contenedor de validación; los roles con IA no lo reciben. El reporte incremental conserva los checks no ejecutados como pendientes; un timeout, reporte incompleto o evidencia inválida impide dar verde. Los hallazgos y su resolución quedan en archivos privados con primera/última detección, contador y hash del log. Esto detecta regresiones cubiertas por las pruebas existentes; no constituye cobertura exhaustiva de todos los casos posibles.

Un timer independiente revisa cada diez minutos siete comprobaciones de disponibilidad de staging, incluida la denegación del endpoint administrativo sin autenticación. No consume IA ni envía correos. Conserva hallazgos y recuperaciones independientemente del worker.

## Correcciones revisadas

En el worker local, cada parche requiere el perfil completo de validación antes del auditor y de crear un PR borrador hacia staging. La evidencia queda ligada al commit, al parche y al reporte. No se hace merge automático ni despliegue de producción. Una publicación con confirmación pendiente se guarda antes de comunicarla al servidor; se reintenta la misma confirmación, sin reportarla falsamente como una corrección fallida ni reclamar otro incidente. Una publicación ambigua bloquea nuevas reclamaciones para revisión.

## Límites explícitos

Los ocho requisitos manuales permanecen pendientes: hardware, APK en dispositivos físicos, pagos reales/3DS, CFDI real, entrega real de correo, DNS/TLS de dominio propio, despliegue/rollback y restauración de respaldos productivos. Las simulaciones no aprueban estos requisitos. `releaseReady` permanece falso. Los tokens locales no se copian a los contenedores de pruebas. La IA conserva autenticación de ChatGPT, sin fallback a una API de pago.

El timer requiere que esta PC esté encendida y su gestor de usuario disponible. Los límites de suscripción pueden pausar correcciones con IA; no pausan las comprobaciones independientes.

## Requisitos de la PC

El puente multimedia necesita bubblewrap, prlimit y setpriv en `/usr/bin`, y ffmpeg/ffprobe del sistema o de la instalación privada ya verificada en `~/.local/ffmpeg`. Solo se ejecutan esos binarios confiables. El socket se crea mediante un descriptor de directorio para admitir las rutas largas de las ejecuciones de systemd. El servidor comprueba la misma identidad local antes de aceptar trabajo.

El checkout utiliza HTTPS y, ante un fallo, reintenta el mismo repositorio por SSH en el puerto 443 con la llave existente y verificación estricta de la llave de GitHub; no acepta llaves nuevas automáticamente. El estado muestra preparación desde el inicio del checkout.
