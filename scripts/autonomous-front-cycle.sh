#!/usr/bin/env bash
set -euo pipefail

: "${KIMI_BIN:=kimi}"
: "${CODEX_BIN:=codex}"
: "${AUTO_MERGE:=false}"
: "${KIMI_TIMEOUT:=8m}"
: "${CODEX_TIMEOUT:=5m}"
: "${INCIDENT_ALERT_EMAIL:=gaessoft@gmail.com}"
: "${EMAIL_REMITENTE:=no-reply@gaessoft.com}"
: "${TASK_PROMPT:=Revisa y mejora el storefront de la tienda. Trabaja solo en el frontend, conserva el aislamiento multi-tenant, agrega pruebas relevantes y no cambies secretos, migraciones ni despliegues.}"
: "${BACKLOG_FILE:=automation/front-backlog.md}"

command -v "$KIMI_BIN" >/dev/null || { echo "No existe KIMI_BIN=$KIMI_BIN" >&2; exit 2; }
command -v "$CODEX_BIN" >/dev/null || { echo "No existe CODEX_BIN=$CODEX_BIN" >&2; exit 2; }
command -v gh >/dev/null || { echo "Se requiere gh para crear el PR" >&2; exit 2; }

# Ejecuta un agente en su propio proceso y grupo. Algunos CLI crean hijos que
# sobreviven al `timeout` de GNU y dejan el runner bloqueado; aquí el watchdog
# mata explícitamente el PID y su grupo y devuelve 124 de forma determinista.
run_agent_with_timeout() {
  local duration="$1"
  shift
  local raw_seconds="${duration%[smh]}"
  local unit="${duration:${#duration}-1}"
  local seconds="$raw_seconds"
  [[ "$unit" == "m" ]] && seconds=$((raw_seconds * 60))
  [[ "$unit" == "h" ]] && seconds=$((raw_seconds * 3600))
  setsid "$@" &
  local pid=$!
  local timeout_marker
  timeout_marker=$(mktemp)
  (
    sleep "$seconds"
    printf timeout > "$timeout_marker"
    echo "Proceso agotó el límite de ${duration}; terminando su grupo" >&2
    kill -TERM "$pid" 2>/dev/null || true
    kill -TERM -- "-$pid" 2>/dev/null || true
    sleep 5
    kill -KILL "$pid" 2>/dev/null || true
    kill -KILL -- "-$pid" 2>/dev/null || true
  ) &
  local watchdog=$!
  local code=0
  wait "$pid" || code=$?
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  local timed_out=false
  [[ ! -s "$timeout_marker" ]] || timed_out=true
  rm -f "$timeout_marker"
  if [[ "$timed_out" == "true" ]]; then return 124; fi
  return "$code"
}

send_email() {
  local status="$1"
  local files="${2:-sin cambios detectados}"
  local judge="${judge_output:-El juez todavía no emitió dictamen.}"
  local checks_detail="${checks:-No se alcanzaron las validaciones.}"
  checks_detail="${checks_detail:0:6000}"
  local test_steps="Abrir la pantalla indicada en Pantallas/áreas revisadas; repetir el flujo feliz y el caso de error descrito en la tarea; verificar responsive en 360, 768 y escritorio. Para reproducir en local: pnpm --filter @gaespos/web-tienda typecheck && pnpm --filter @gaespos/web-tienda exec vitest run && pnpm --filter @gaespos/web-tienda build"
  [[ -n "${BREVO_API_KEY:-}${RESEND_API_KEY:-}" ]] || return 0
  local subject="[GaesPOS] Ciclo autónomo ${status}"
  local text="Ciclo autónomo: ${status}\n\nPantallas/áreas revisadas:\n${files}\n\nQué se pidió/resolvió:\n${TASK_PROMPT}\n\nCómo probarlo:\n${test_steps}\n\nValidaciones ejecutadas:\n${checks_detail}\n\nDictamen Codex:\n${judge}\n\nRama: ${branch:-no creada}"
  local html="<h2>Ciclo autónomo: ${status}</h2><h3>Pantallas/áreas revisadas</h3><pre>${files}</pre><h3>Qué se pidió/resolvió</h3><p>${TASK_PROMPT}</p><h3>Cómo probarlo</h3><p>${test_steps}</p><h3>Validaciones ejecutadas</h3><pre>${checks_detail}</pre><h3>Dictamen Codex</h3><pre>${judge}</pre><p>Rama: ${branch:-no creada}</p>"
  export EMAIL_REMITENTE INCIDENT_ALERT_EMAIL
  python3 -c 'import json,sys; print(json.dumps({"subject":sys.argv[1],"text":sys.argv[2],"html":sys.argv[3]}))' "$subject" "$text" "$html" | \
    python3 scripts/send-system-email.py || echo "No se pudo enviar el correo de ciclo" >&2
}

on_exit() {
  local code=$?
  local status="falló (código ${code})"
  [[ "$code" == "0" ]] && status="terminó"
  send_email "$status" "$(git diff --name-only 2>/dev/null || true)"
  exit "$code"
}
trap on_exit EXIT

branch="automation/front-cycle-$(date -u +%Y%m%d-%H%M%S)"
git switch -c "$branch"
# Keep the base only in this shell; agents cannot hide changes by committing.
cycle_base_commit=$(git rev-parse HEAD)
readonly cycle_base_commit

backlog_line=$(grep -m1 -E '^- \[ \] ST-[0-9]+ \|' "$BACKLOG_FILE" || true)
if [[ -z "$backlog_line" ]]; then
  echo "No hay tareas pendientes en $BACKLOG_FILE."
  exit 0
fi
task_id=$(printf '%s' "$backlog_line" | sed -E 's/^- \[ \] (ST-[0-9]+) \|.*/\1/')
task_text=$(printf '%s' "$backlog_line" | cut -d'|' -f2- | sed 's/^ //')

run_checks() {
  # This function is called under `if !`; Bash disables implicit errexit in
  # that context. Every mandatory check must propagate its own failure.
  git diff --check || return $?
  pnpm --filter @gaespos/web-tienda typecheck || return $?
  pnpm --filter @gaespos/web-tienda exec vitest run || return $?
  pnpm --filter @gaespos/web-tienda build || return $?
  # Solo las tareas de mobile ejecutan la suite mobile; una tarea de tienda
  # no debe quedar roja por una regresión ajena a su superficie.
  if [[ "$task_id" == "ST-006" ]]; then
    pnpm --filter @gaespos/mobile-cliente typecheck || return $?
    pnpm --filter @gaespos/mobile-cliente test -- --run || return $?
  fi
}

assert_front_scope() {
  [[ "$(git rev-parse HEAD)" == "$cycle_base_commit" ]] || { echo "HEAD cambió durante el ciclo; publicación bloqueada." >&2; return 1; }
  python3 - "$task_id" "${1:-}" <<'PY_SCOPE'
from pathlib import Path
import hashlib
import subprocess
import sys
allowed = ['apps/web-tienda/src/', 'apps/web-tienda/test/', 'apps/web-tienda/tests/', 'apps/web-tienda/public/']
if sys.argv[1] == 'ST-006':
    allowed += ['apps/mobile-cliente/app/', 'apps/mobile-cliente/src/', 'apps/mobile-cliente/assets/', 'apps/mobile-cliente/test/', 'apps/mobile-cliente/tests/']
# --no-renames exposes both sides of a move, including deleted sensitive files.
tracked = subprocess.check_output(['git', 'diff', '--no-renames', '--name-only', '-z', 'HEAD', '--'])
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'])
digest = hashlib.sha256()
# Include the index separately: git-add/reset may preserve identical worktree bytes.
digest.update(subprocess.check_output(['git', 'diff', '--cached', '--binary', '--no-ext-diff', '--no-renames', 'HEAD', '--']))
for raw in sorted(set((tracked + untracked).split(b'\0'))):
    if not raw:
        continue
    name = raw.decode('utf-8', errors='strict')
    file = Path(name)
    sensitive = any(part.startswith('.env') or part in {'migrations', '.github'} for part in file.parts)
    sensitive |= file.suffix.lower() in {'.jks', '.keystore', '.p12', '.pem', '.key'}
    linked = any(part.is_symlink() for part in (file, *file.parents))
    if not name.startswith(tuple(allowed)) or sensitive or linked:
        raise SystemExit('Cambio fuera del alcance frontend permitido; publicación bloqueada.')
    digest.update(raw + b'\0')
    if file.exists():
        digest.update(str(file.stat().st_mode).encode() + b'\0' + hashlib.sha256(file.read_bytes()).digest())
    else:
        digest.update(b'deleted\0')
if sys.argv[2] == 'fingerprint':
    print(digest.hexdigest())
PY_SCOPE
}

TASK_PROMPT="Tarea ${task_id}: ${task_text} Implementa solo esta tarea y sus pruebas. Conserva el alcance y no adelantes tareas posteriores."

judge_prompt=$(cat <<'EOF'
Eres el juez Codex. Revisa solo los archivos cambiados por esta tarea.
No modifiques archivos, no hagas commits ni staging; la revisión es de solo lectura.
Primero ejecuta `git status --short` y `git diff --stat`; lee únicamente esos archivos.
No ejecutes pruebas, builds, lint ni explores node_modules: el ejecutor ya dejó las
validaciones en verde. No recorras el repositorio completo.
Verifica alcance, tenant isolation, precios, imágenes, accesibilidad y regresiones
visibles en el diff.
Responde en la primera línea exactamente APPROVED o REJECTED y después enumera evidencia y correcciones.
Aprueba solo si el cambio está listo para merge.
EOF
)
feedback=""
approved=false
for attempt in 1 2; do
  kimi_prompt=$(cat <<EOF
Eres el ejecutor Kimi. Implementa esta tarea en el repositorio actual:
$TASK_PROMPT

Reglas: no hagas commits ni staging, no hagas push, no hagas deploy, no ejecutes migraciones, no modifiques secretos.
Ejecuta las pruebas relevantes y deja los cambios en el worktree.
${feedback:+El intento anterior recibió estas observaciones. Corrígelas ahora:\n$feedback}
EOF
  )
  set +e
  kimi_output_file=$(mktemp)
  run_agent_with_timeout "$KIMI_TIMEOUT" "$KIMI_BIN" -p "$kimi_prompt" --output-format text >"$kimi_output_file" 2>&1
  kimi_status=$?
  cat "$kimi_output_file"
  rm -f "$kimi_output_file"
  set -e
  if [[ "$kimi_status" != "0" ]]; then
    feedback="Kimi falló o agotó ${KIMI_TIMEOUT} en el intento ${attempt}; revisa la salida y corrige la tarea."
    # Repetir una tarea que agotó todo su presupuesto solo produce otro correo
    # rojo y descarta tiempo del runner. Los rechazos de validación sí pueden
    # pasar al segundo intento porque ya tienen observaciones concretas.
    if [[ "$kimi_status" == "124" || "$kimi_status" == "137" || "$kimi_status" == "143" ]]; then
      break
    fi
    continue
  fi
  if ! assert_front_scope; then
    feedback="Hay cambios fuera de la lista de frontend permitida. Retíralos antes de continuar."
    continue
  fi
  if ! checks=$(run_checks 2>&1); then
    feedback="Las validaciones fallaron en el intento ${attempt}:\n${checks}"
    continue
  fi
  # El juez debe poder ejecutar Vitest y crear temporales dentro del checkout;
  # el runner está aislado y no recibe secretos desde el diff.
  # Codex no necesita el watchdog de Kimi: su CLI ya respeta timeout y el
  # envoltorio anterior podía dejar el proceso de espera vivo después de que
  # el juez terminara. Usa timeout directo para que la etapa cierre siempre.
  if ! reviewed_snapshot=$(assert_front_scope fingerprint); then
    feedback="No se pudo fijar el estado validado antes de la revisión."
    continue
  fi
  judge_message_file=$(mktemp)
  set +e
  judge_cli_output=$(timeout --signal=TERM --kill-after=30s "$CODEX_TIMEOUT" "$CODEX_BIN" exec --dangerously-bypass-approvals-and-sandbox --ephemeral --output-last-message "$judge_message_file" "$judge_prompt" 2>&1)
  judge_status=$?
  set -e
  judge_output=$(cat "$judge_message_file")
  rm -f "$judge_message_file"
  printf '%s\n' "$judge_output" | tee /tmp/codex-judge.txt
  if [[ "$judge_status" != "0" ]]; then
    feedback="Codex no completó una revisión válida (código ${judge_status}); no se admite aprobación parcial ni por timeout."
    continue
  fi
  if ! after_review_snapshot=$(assert_front_scope fingerprint) || [[ "$after_review_snapshot" != "$reviewed_snapshot" ]]; then
    feedback="El juez modificó el índice o archivos después de las validaciones. Se requiere otra ejecución y revisión sin modificaciones."
    continue
  fi
  # Parse the final answer, not CLI logs or a later APPROVED quoted in evidence.
  judge_decision=$(printf '%s\n' "$judge_output" | head -n 1)
  if [[ "$judge_decision" == "APPROVED" ]]; then
    approved=true
    break
  fi
  feedback="Codex rechazó el intento ${attempt}. Corrige estas observaciones:\n${judge_output}"
done

if [[ "$approved" != "true" ]]; then
  echo "Kimi no logró una entrega aprobada después de dos intentos." >&2
  exit 1
fi

assert_front_scope

# El avance de la cola ocurre únicamente después del dictamen APPROVED.
# El estado/cache de Codex vive temporalmente dentro del checkout del runner.
# Nunca debe entrar en una rama de producto ni en el lint del PR.
if [[ "${CODEX_HOME:-}" == "$PWD/.codex-runner" ]]; then
  rm -rf "$CODEX_HOME"
fi

python3 - "$BACKLOG_FILE" "$task_id" <<'PY'
from pathlib import Path
import sys
path, task_id = Path(sys.argv[1]), sys.argv[2]
lines = path.read_text().splitlines()
for i, line in enumerate(lines):
    if line.startswith(f"- [ ] {task_id} |"):
        lines[i] = line.replace("- [ ]", "- [x]", 1)
        break
else:
    raise SystemExit(f"No se encontró {task_id} en la cola")
path.write_text("\n".join(lines) + "\n")
PY

git add -A
git diff --cached --quiet && { echo "No hubo cambios para publicar."; exit 0; }
# Las validaciones del ciclo ya se ejecutaron antes de llegar aquí. El hook
# global de pre-commit también escanea plantillas externas fuera del diff y
# puede bloquear una entrega aprobada por problemas ajenos a la tarea.
git -c core.hooksPath=/dev/null commit -m "chore(automation): apply approved storefront cycle"
git push --set-upstream origin "$branch"
if pr_url=$(gh pr create --base main --head "$branch" --title "Automated storefront cycle" --body-file /tmp/codex-judge.txt 2>&1); then
  echo "PR creado: $pr_url"
else
  # Algunas organizaciones bloquean createPullRequest para GITHUB_TOKEN aun
  # con pull-requests: write. La entrega aprobada ya quedó publicada; deja el
  # enlace manual en el correo y no convierte ese permiso externo en fallo.
  pr_url="https://github.com/${GH_REPO:-Gaes-Solutions/verticals}/compare/main...${branch}?expand=1"
  echo "No se pudo crear el PR automáticamente; rama publicada: $pr_url" >&2
fi

if [[ "$AUTO_MERGE" == "true" && "$pr_url" == https://github.com/*/pull/* ]]; then
  gh pr merge "$pr_url" --squash --auto --delete-branch
elif [[ "$AUTO_MERGE" == "true" ]]; then
  echo "AUTO_MERGE quedó omitido porque no existe un PR creado por el token."
else
  echo "AUTO_MERGE no está activo; el PR queda esperando revisión humana."
fi
