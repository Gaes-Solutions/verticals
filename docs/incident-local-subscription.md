# Trabajador local con la suscripción de ChatGPT

Este modo sustituye la ejecución con API key de GitHub por un trabajador en la PC.
Usa Codex CLI 0.163.0 con inicio de sesión ChatGPT y modelo `gpt-6.1-sol`.
No necesita `OPENAI_API_KEY`, no cambia a otro proveedor y no compra créditos.
El workflow remoto de incidentes queda deshabilitado mediante `AUTONOMOUS_INCIDENT_ENABLED=false`.

## Funcionamiento

El temporizador de usuario inicia un ciclo al arrancar la sesión y vuelve a comprobar trabajo diez minutos después de que termine cada ciclo. Cerrar la terminal no lo detiene. La PC debe permanecer encendida, con Docker y conexión disponibles. El servicio de usuario vuelve a estar disponible al iniciar sesión; no se habilita el arranque sin sesión mediante privilegios administrativos.

Antes de reservar un incidente y antes de cada fase con IA, una consulta de solo lectura comprueba que:

- La autenticación corresponde a ChatGPT, sin clave API ni configuración de proveedores ajenos.
- El servidor permite uso ordinario incluido y el plan es reconocido.
- Todas las ventanas aplicables conservan al menos 10 % disponible.
- No hay una bolsa adicional de créditos disponible ni modalidad ilimitada pagada.

Si no se cumplen las condiciones o la respuesta es desconocida, espera sin llamar al modelo. No ejecuta ninguna operación de compra, recarga ni reinicio de créditos. La suscripción se comparte con el uso de Codex en otros clientes. Una compra o cambio de configuración realizado por otro cliente durante una tarea no puede impedirse con una comprobación previa; no se promete una garantía de facturación sobre cambios externos a este trabajador.

## Separación de acceso

El coordinador confiable conserva el token del puente y la sesión GitHub. No ejecuta código generado.
Los modelos reciben únicamente un checkout desechable, los datos saneados del incidente y una copia privada de la sesión ChatGPT. Nunca se copia la configuración personal, `.env`, claves de pagos ni bases del negocio.

Ejecutor y auditor corren en contenedores diferentes: usuario sin privilegios, raíz de solo lectura, sin capacidades Linux, sin socket Docker y sin montaje del HOME personal. Su red interna solo permite salir por un proxy CONNECT hacia hosts TLS fijos de OpenAI con direcciones públicas. La copia de autenticación se elimina incluso al fallar la fase.

Docker no permite los namespaces anidados del sandbox interno de Codex en esta PC. En este modo se usa el contenedor como sandbox externo, sin desactivar seccomp, sin privilegios y sin añadir capacidades. El controlador verifica esa frontera antes de permitir `danger-full-access` dentro del contenedor. El auditor conserva comprobaciones que rechazan cualquier cambio de fuente, índice o artefactos durante la revisión.

El validador recibe únicamente PostgreSQL sintético desechable y dependencias instaladas desde la base intacta, sin credenciales de IA o del negocio. El publicador usa otro checkout y abre exclusivamente un PR borrador a `staging`; no hace merge ni despliega producción. Los callbacks locales usan `urn:gaes:incident-worker:<UUID>`; no inventan enlaces a ejecuciones GitHub.

## Instalación y estado

La preparación copia únicamente los scripts revisados y credenciales necesarias a una carpeta privada fuera del repositorio. No reemplaza una sesión dedicada ya existente ni modifica el archivo original de autenticación de Codex.

```sh
python3 scripts/setup-incident-local.py
python3 scripts/install-incident-local-service.py --state "$HOME/.local/share/gaes-incident-local" --install
python3 scripts/install-incident-local-service.py --state "$HOME/.local/share/gaes-incident-local" --status
python3 scripts/incident-local-worker.py status --state "$HOME/.local/share/gaes-incident-local"
```

Los comandos de instalación se ejecutan desde el repositorio. La imagen local se construye con `scripts/local-worker/Dockerfile`. Si caduca la sesión dedicada, el trabajador se detiene en espera de autenticación; nunca solicita una API key como alternativa automática.

Estados de trabajo: `idle` (sin incidentes aprobados), `waiting` (cupo o dependencia pendiente), `working`, `review_required` (PR creado) y `failed` (ciclo fallido, registrado para el límite de reintentos). Las reservas vencidas se recuperan por el circuito normal. Alcanzar el límite de suscripción durante un ciclo deja la reserva para recuperación, sin contarlo como un fallo de código.

La activación real del temporizador y una vuelta completa se verifican por separado de las pruebas simuladas. Que esté programado no demuestra que haya creado una corrección: debe existir un incidente aprobado y, para integración, una revisión humana del PR.

Referencia de autenticación: [OpenAI Docs](https://learn.chatgpt.com/docs/auth).
