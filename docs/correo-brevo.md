# Correo transaccional con Brevo

## Dónde guardar la clave

En Railway, seleccionar el ambiente **staging**, el servicio API **verticals**
y **Variables**. Crear `BREVO_API_KEY` pegando la clave directamente en el valor.
Usar una clave API de Brevo, no una clave SMTP. Configurar `EMAIL_REMITENTE` con
un remitente verificado en Brevo, como correo solo o `Nombre <correo>`.
Aplicar los cambios pendientes de Railway para que lleguen al servicio.

No pegar la clave en chats, commits, archivos de ejemplo ni variables públicas
de web o APK. No hay que recompilar las aplicaciones por este cambio.

El código selecciona Brevo cuando `BREVO_API_KEY` tiene valor. Si falta esa
variable, conserva Resend; sin ambas claves mantiene el proveedor simulado de
desarrollo. Un rechazo de Brevo no cambia automáticamente a Resend ni a mock.
La confirmación del API indica aceptación del mensaje, no entrega al buzón.

## Avisos de GitHub Actions

Los correos del ciclo autónomo y su watchdog se envían desde GitHub, fuera de
Railway. Guardar allí también `BREVO_API_KEY` como **Actions secret** del
repositorio y `EMAIL_REMITENTE` como **Actions variable**, nunca como variable
para la clave. Esto no activa los ciclos que estén deshabilitados.
El destinatario de avisos existente se conserva.

## Activación y validación

1. Desplegar primero este soporte en staging.
2. Configurar clave y remitente; comprobar selección de proveedor sin imprimir
   el valor de ninguna variable secreta.
3. Con autorización para enviar, solicitar recuperación de contraseña de una
   cuenta de prueba que controle el dueño. Revisar el correo recibido, dominio
   del enlace, caducidad y uso único del token.
4. Revisar los registros transaccionales en Brevo y la entrega al buzón. Una
   respuesta genérica de recuperación por sí sola no demuestra envío.
5. Tras aprobar staging, usar credencial separada en producción y repetir la
   verificación. Conservar Resend hasta confirmar el cambio; retirarlo después
   de Railway y GitHub si ya no se necesita.

Referencia: [API de correo transaccional de Brevo](https://developers.brevo.com/reference/send-transac-email).
