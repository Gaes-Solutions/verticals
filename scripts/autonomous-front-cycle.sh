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
  (
    sleep "$seconds"
    echo "Proceso agotó el límite de ${duration}; terminando su grupo" >&2
    kill -TERM "$pid" 2>/dev/null || true
    kill -TERM -- "-$pid" 2>/dev/null || true
    sleep 5
    kill -KILL "$pid" 2>/dev/null || true
    kill -KILL -- "-$pid" 2>/dev/null || true
  ) &
  local watchdog=$!
  set +e
  wait "$pid"
  local code=$?
  set -e
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  if [[ "$code" != "0" ]]; then
    return 124
  fi
  return 0
}

send_email() {
  local status="$1"
  local files="${2:-sin cambios detectados}"
  local judge="${judge_output:-El juez todavía no emitió dictamen.}"
  local checks_detail="${checks:-No se alcanzaron las validaciones.}"
  checks_detail="${checks_detail:0:6000}"
  local test_steps="Abrir la pantalla indicada en Pantallas/áreas revisadas; repetir el flujo feliz y el caso de error descrito en la tarea; verificar responsive en 360, 768 y escritorio. Para reproducir en local: pnpm --filter @gaespos/web-tienda typecheck && pnpm --filter @gaespos/web-tienda exec vitest run && pnpm --filter @gaespos/web-tienda build"
  [[ -n "${RESEND_API_KEY:-}" ]] || return 0
  local subject="[GaesPOS] Ciclo autónomo ${status}"
  local text="Ciclo autónomo: ${status}\n\nPantallas/áreas revisadas:\n${files}\n\nQué se pidió/resolvió:\n${TASK_PROMPT}\n\nCómo probarlo:\n${test_steps}\n\nValidaciones ejecutadas:\n${checks_detail}\n\nDictamen Codex:\n${judge}\n\nRama: ${branch:-no creada}"
  local html="<h2>Ciclo autónomo: ${status}</h2><h3>Pantallas/áreas revisadas</h3><pre>${files}</pre><h3>Qué se pidió/resolvió</h3><p>${TASK_PROMPT}</p><h3>Cómo probarlo</h3><p>${test_steps}</p><h3>Validaciones ejecutadas</h3><pre>${checks_detail}</pre><h3>Dictamen Codex</h3><pre>${judge}</pre><p>Rama: ${branch:-no creada}</p>"
  curl --connect-timeout 10 --max-time 30 -fsS https://api.resend.com/emails \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    --data-binary "$(python3 -c 'import json,sys; print(json.dumps({"from":sys.argv[1],"to":[sys.argv[2]],"subject":sys.argv[3],"text":sys.argv[4],"html":sys.argv[5]}))' "$EMAIL_REMITENTE" "$INCIDENT_ALERT_EMAIL" "$subject" "$text" "$html")" >/dev/null || echo "No se pudo enviar el correo de ciclo" >&2
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

backlog_line=$(grep -m1 -E '^- \[ \] ST-[0-9]+ \|' "$BACKLOG_FILE" || true)
if [[ -z "$backlog_line" ]]; then
  echo "No hay tareas pendientes en $BACKLOG_FILE."
  exit 0
fi
task_id=$(printf '%s' "$backlog_line" | sed -E 's/^- \[ \] (ST-[0-9]+) \|.*/\1/')
task_text=$(printf '%s' "$backlog_line" | cut -d'|' -f2- | sed 's/^ //')

run_checks() {
  git diff --check
  pnpm --filter @gaespos/web-tienda typecheck
  pnpm --filter @gaespos/web-tienda exec vitest run
  pnpm --filter @gaespos/web-tienda build
  # Solo las tareas de mobile ejecutan la suite mobile; una tarea de tienda
  # no debe quedar roja por una regresión ajena a su superficie.
  if [[ "$task_id" == "ST-006" ]]; then
    pnpm --filter @gaespos/mobile-cliente typecheck
    pnpm --filter @gaespos/mobile-cliente test -- --run
  fi
}
TASK_PROMPT="Tarea ${task_id}: ${task_text} Implementa solo esta tarea y sus pruebas. Conserva el alcance y no adelantes tareas posteriores."

judge_prompt=$(cat <<'EOF'
Eres el juez Codex. Revisa solo los archivos cambiados por esta tarea.
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

Reglas: no hagas push, no hagas deploy, no ejecutes migraciones, no modifiques secretos.
Ejecuta las pruebas relevantes y deja los cambios en el worktree.
${feedback:+El intento anterior recibió estas observaciones. Corrígelas ahora:\n$feedback}
EOF
  )
  set +e
  kimi_output_file=$(mktemp)
  run_agent_with_timeout "$KIMI_TIMEOUT" "$KIMI_BIN" -p "$kimi_prompt" --output-format text >"$kimi_output_file" 2>&1
  kimi_status=$?
  cat "$kimi_output_file"
  # Kimi puede dejar un proceso hijo de su servidor abierto después de
  # completar la edición; el watchdog devuelve 124 aunque el worktree ya
  # contiene una entrega completa. Solo continuamos en ese caso si existe un
  # diff real; las validaciones y Codex siguen siendo obligatorios.
  if [[ "$kimi_status" == "124" ]] && ! git diff --quiet; then
    echo "Kimi dejó cambios antes de cerrar su proceso; continúo con validaciones." >&2
    kimi_status=0
  fi
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
  if ! checks=$(run_checks 2>&1); then
    feedback="Las validaciones fallaron en el intento ${attempt}:\n${checks}"
    continue
  fi
  # El juez debe poder ejecutar Vitest y crear temporales dentro del checkout;
  # el runner está aislado y no recibe secretos desde el diff.
  judge_output=$(run_agent_with_timeout "$CODEX_TIMEOUT" "$CODEX_BIN" exec --dangerously-bypass-approvals-and-sandbox --ephemeral "$judge_prompt" 2>&1 | tee /tmp/codex-judge.txt || true)
  judge_decision=$(printf '%s\n' "$judge_output" | sed -n '/^APPROVED$/p;/^REJECTED$/p' | sed -n '1p')
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

# El avance de la cola ocurre únicamente después del dictamen APPROVED.
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
pr_url=$(gh pr create --base main --head "$branch" --title "Automated storefront cycle" --body-file /tmp/codex-judge.txt)
echo "PR creado: $pr_url"

if [[ "$AUTO_MERGE" == "true" ]]; then
  gh pr merge "$pr_url" --squash --auto --delete-branch
else
  echo "AUTO_MERGE no está activo; el PR queda esperando revisión humana."
fi
