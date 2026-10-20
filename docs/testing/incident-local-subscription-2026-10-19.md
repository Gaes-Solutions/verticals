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
| Instalador del temporizador | 10/10 |
| Coordinador, preparación y proxy | 12/12 |
| PostgreSQL temporal | 12/12 |

También pasaron los 30 typechecks del repositorio y la verificación de GitHub del commit `83eed98`.

## Prueba real con la suscripción

Se ejecutó un modelo real dentro del contenedor de executor, mediante ChatGPT, sobre un repositorio artificial aislado. La función de prueba fallaba con nombres nulos o ausentes. Codex generó un parche y cinco aserciones independientes de Node comprobaron el resultado dentro de otro contenedor sin red ni autenticación.

Resultado: corrección correcta, cinco casos aprobados, parche generado. No se usó ninguna API key, dato del negocio, envío de correo, pago, publicación ni PR. El repositorio artificial y la copia temporal de sesión fueron eliminados. Esta comprobación verifica el ejecutor real y la conexión; no demuestra que se haya corregido ya un incidente de la tienda ni sustituye el validador completo de un PR real.

Evidencia local: `/tmp/gaes-subscription-real-proof.json`; PostgreSQL: `/tmp/gaes-api-isolated-SIrHeH/results.json` (base eliminada).

El modo remoto de pago está deshabilitado con `AUTONOMOUS_INCIDENT_ENABLED=false`. El estado operativo del temporizador se consulta con los comandos del [manual local](../incident-local-subscription.md); un temporizador programado puede estar esperando incidentes aprobados o cupo disponible.

## Activación comprobada en la PC

Se instaló y habilitó `gaes-incident-local.timer` mediante el D-Bus de usuario. Estado comprobado: temporizador `active/waiting`, servicio oneshot terminado con `result=success` y código 0. La primera vuelta devolvió `idle`: se comprobó el cupo y se consultó correctamente la cola, sin incidentes aprobados disponibles. Al terminar la vuelta quedaba 24 % de cupo incluido; ese valor es una instantánea, no una reserva.

El estado `inactive/dead` del servicio entre ciclos es normal: el temporizador permanece activo y lo vuelve a iniciar diez minutos después de terminar cada vuelta. El trabajador no depende de esta terminal. No se publicaron correcciones del negocio ni se modificó producción durante esta activación.

La instalación real detectó y permitió corregir dos defectos adicionales: permisos heredados demasiado amplios en el directorio intermedio del controlador y comillas de shell inválidas en `WorkingDirectory` de systemd. Las regresiones nuevas cubren ambos casos.

Evidencia de activación: `/tmp/gaes-subscription-local-activation.json`.
