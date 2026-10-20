# Verificación del trabajador local con ChatGPT

## Cambios comprobados

- Autenticación exclusiva por sesión ChatGPT; sin clave API, compras ni cambio automático de proveedor.
- Ejecutor y auditor aislados en contenedores diferentes, con red limitada a hosts OpenAI y sin acceso a credenciales del negocio.
- Consulta de cupo incluido antes de reservar trabajo y antes de cada fase de IA.
- Identificador de ejecución local comprobable en los callbacks, sin enlaces GitHub inventados.
- Instalador de temporizador de usuario mediante D-Bus estándar; sin privilegios administrativos.
- Almacenamiento de dependencias de QA dentro de su checkout desechable, para no llenar el espacio temporal limitado del contenedor.

## Pruebas

| Grupo | Resultado |
| --- | --- |
| Automatización API aislada | 153/153 |
| Transporte Python | 26/26 |
| Fases y arquitectura | 32/32 |
| Autenticación y cupo de suscripción | 25/25 |
| Instalador del temporizador | 9/9 |
| Coordinador y proxy | 10/10 |
| PostgreSQL temporal | 12/12 |

También pasaron los 30 typechecks del repositorio y la verificación de GitHub del commit `83eed98`.

## Prueba real con la suscripción

Se ejecutó un modelo real dentro del contenedor de executor, mediante ChatGPT, sobre un repositorio artificial aislado. La función de prueba fallaba con nombres nulos o ausentes. Codex generó un parche y cinco aserciones independientes de Node comprobaron el resultado dentro de otro contenedor sin red ni autenticación.

Resultado: corrección correcta, cinco casos aprobados, parche generado. No se usó ninguna API key, dato del negocio, envío de correo, pago, publicación ni PR. El repositorio artificial y la copia temporal de sesión fueron eliminados. Esta comprobación verifica el ejecutor real y la conexión; no demuestra que se haya corregido ya un incidente de la tienda ni sustituye el validador completo de un PR real.

Evidencia local: `/tmp/gaes-subscription-real-proof.json`; PostgreSQL: `/tmp/gaes-api-isolated-SIrHeH/results.json` (base eliminada).

El modo remoto de pago está deshabilitado con `AUTONOMOUS_INCIDENT_ENABLED=false`. El estado operativo del temporizador se consulta con los comandos del [manual local](../incident-local-subscription.md); un temporizador programado puede estar esperando incidentes aprobados o cupo disponible.
