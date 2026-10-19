# Endurecimiento del ciclo autónomo de storefront

El ciclo se divide en cuatro jobs: `executor`, `validate`, `judge` y
`publish`. Cada job hace checkout con `persist-credentials: false` y recibe
únicamente las credenciales que necesita. Kimi recibe la configuración oficial
`KIMI_MODEL_NAME` y `KIMI_MODEL_API_KEY` del paso de ejecución; no se intenta
autenticar con `~/.kimi-code`.

Los jobs de modelo instalan las CLIs desde sus paquetes oficiales con versiones
fijadas antes de recibir secretos: `@moonshot-ai/kimi-code@2.2.0` usa
`KIMI_MODEL_NAME` y `KIMI_MODEL_API_KEY`; Codex usa
`@openai/codex` con `CODEX_VERSION` y por defecto `0.130.0`.

## Límites por fase

- `executor`: Kimi puede modificar el worktree permitido. Solo recibe
  `KIMI_MODEL_API_KEY`; no recibe GitHub, correo ni OpenAI. Exporta un patch binario,
  `base_sha`, `task_id` y `patch_sha256`.
- `validate`: no recibe secretos. Verifica base, hash, rutas y symlinks; después
  copia el checkout ya validado a un contenedor `node:24-bookworm-slim` fijado
  por digest, sin red, sin `.git`, sin el controlador ni el directorio de
  artefactos, y ejecuta ahí typecheck, tests y build con `bash -euo
  pipefail`. El controlador compara la huella de los archivos fuente de esa
  copia antes y después de los checks. Si Docker, pnpm offline o la imagen no
  están disponibles, falla cerrada. `AUTONOMY_VALIDATE_TEST_MODE` solo existe
  para los fixtures fake del test suite y nunca se habilita en el workflow.
- `judge`: solo recibe `OPENAI_API_KEY`. Codex se ejecuta con
  `--sandbox read-only --ephemeral`; el snapshot staged se comprueba antes y
  después.
- `publish`: no ejecuta modelos ni package scripts. Verifica nuevamente base,
  hash, alcance y dictamen `APPROVED`, después aplica el patch y publica con
  `GH_TOKEN`. El auto merge conserva `false` por defecto.

Los artefactos no contienen entornos ni archivos de autenticación. La fase de
publicación falla cerrada si falta el patch, la metadata, la validación, el
dictamen o el token requerido. Si el runner Ubuntu no tiene una CLI configurada
(`kimi`, `codex`), el job queda en estado de readiness desconocido y termina sin
publicar. También termina sin ejecutar una CLI si falta `KIMI_MODEL_API_KEY`,
`KIMI_MODEL_NAME`,
`OPENAI_API_KEY` o `GH_TOKEN`; no hace fallback a `HOME` ni a archivos de
autenticación personales.

La fuente de control es el checkout confiable de la revisión del workflow. El
publisher no vuelve a ejecutar código del paquete después de recibir las
credenciales de publicación. Los hashes ligan patch, metadata y evidencia entre
fases; no son una firma criptográfica ni sustituyen una identidad de confianza.
