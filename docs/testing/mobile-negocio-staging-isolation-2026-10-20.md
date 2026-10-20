# Aislamiento de builds de Negocio — 20 de octubre de 2026

## Hallazgo

El perfil EAS `preview` de GaesSoft Negocio apuntaba a `https://app.angaes.com/api` y usaba `com.gaessoft.negocio`, igual que producción. Un APK de prueba podía operar sobre datos reales o instalarse encima de la aplicación productiva. La última APK de Negocio disponible en EAS se había compilado el 9 de septiembre desde `36a3c78`; su enlace temporal ya venció. Después hubo cambios en la app, incluido el flujo de devoluciones.

## Corrección

`development` y `preview` ahora usan `https://verticals-staging.up.railway.app/api`, el nombre visible **GaesSoft Negocio (Pruebas)**, el scheme `gaessoft-negocio-staging` y los identificadores Android/iOS `com.gaessoft.negocio.staging`. Solo el perfil EAS `production` conserva el identificador original y apunta a producción. La configuración de la app valida el perfil y la URL juntos y rechaza combinaciones cruzadas o variantes desconocidas.
La comprobación de perfiles queda fuera del código JavaScript distribuido; el bundle Metro no incluye la URL de producción.

## Validación

- 114 pruebas unitarias de Negocio aprobadas; incluyen siete casos de aislamiento de perfiles y bundle, con resolución real de Expo para staging y producción.
- Typecheck de `mobile-negocio` aprobado.
- Configuración Expo resuelta para `staging` y `production`; API, nombres, schemes e identificadores coinciden.
- Exportación Metro de Android completada: bundle de 3.44 MB sin la URL de producción ni patrones de llaves privadas de proveedor.
- Cliente 17 y kiosco 4: firma, paquete, permisos y certificados verificados localmente. El workflow Android de GitHub pasó el 19 de octubre, comprobando ambos APK actuales en un emulador Android.
- El dominio público existente de Gaesland respondió con DNS CNAME, HTTPS válido y el negocio esperado. Un subdominio aleatorio sin asignación devolvió 503.

La corrección de perfiles no crea un APK nuevo ni equivale a instalar Negocio en un teléfono. La APK de Negocio necesita reconstruirse con el perfil `preview`; cámara, huella y el resto de la operación móvil aún requieren el dispositivo real. La suite completa y el check de staging vigentes están en `~/.local/share/gaes-incident-local/verification-summary.json`.
