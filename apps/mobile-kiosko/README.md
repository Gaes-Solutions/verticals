# GaesSoft Verificador de precios

Aplicación Expo / React Native para un dispositivo de consulta de precios de una sucursal. No es la aplicación de empleados ni una caja de cobro.

## Funciones implementadas

- Activación con token de dispositivo generado en el panel Kioskos; se valida antes de sustituir el token guardado con SecureStore.
- Consulta por cámara, lector externo en modo teclado con terminador Enter o escritura manual. Los ceros iniciales del código se conservan.
- Precio, promoción y existencia cuando la configuración lo permite.
- Reposo con imágenes y texto de promociones o productos publicados. Los videos propios aún no están implementados.
- Errores explícitos, reintento y bloqueo ante dispositivo no autorizado. Peticiones con límite de12 segundos.
- Configuración y anuncios consultados cada30 segundos mientras la aplicación se ejecuta. Un fallo de actualización oculta el contenido anterior. Esto no garantiza plazos cuando el sistema operativo suspende la aplicación.

## Desarrollo

Desde la raíz del repositorio:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000/api pnpm --filter @gaespos/mobile-kiosko start
pnpm --filter @gaespos/mobile-kiosko test
pnpm --filter @gaespos/mobile-kiosko typecheck
```

Usa una API de prueba accesible desde el dispositivo. En un teléfono, localhost apunta al teléfono. No uses tokens de producción en demostraciones o fixtures. Para distribución configura el dominio HTTPS autorizado de la API.

## Operación y límites

El encargado crea un dispositivo en el panel, copia el token una sola vez y lo activa en la aplicación. Mantener pulsada la esquina abre una confirmación para configurar. Esta confirmación evita cambios accidentales; no autentica al encargado ni sustituye el modo kiosco administrado del sistema operativo.

El lector debe enviar caracteres como teclado y terminar con Enter. La prueba web simula esta entrada; cámara, lector físico, rotación, arranque automático y operación prolongada requieren pruebas en cada equipo objetivo. No hay instalador o certificación de dispositivos concluida.

La revisión local comprobó consulta válida, código desconocido, error503 con recuperación, ceros iniciales y anchos360/768/1440. Las pruebas automatizadas usan datos ficticios y no certifican hardware. La reproducción de videos, emparejamiento temporal, renovación administrada de tokens y restricciones físicas de Android/iOS siguen pendientes.
