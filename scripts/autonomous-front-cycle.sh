#!/usr/bin/env bash
set -euo pipefail

: "${KIMI_BIN:=kimi}"
: "${CODEX_BIN:=codex}"
: "${AUTO_MERGE:=false}"
: "${INCIDENT_ALERT_EMAIL:=garudele@gmail.com}"
: "${EMAIL_REMITENTE:=no-reply@gaessoft.com}"
: "${TASK_PROMPT:=Revisa y mejora el storefront de la tienda. Trabaja solo en el frontend, conserva el aislamiento multi-tenant, agrega pruebas relevantes y no cambies secretos, migraciones ni despliegues.}"

command -v "$KIMI_BIN" >/dev/null || { echo "No existe KIMI_BIN=$KIMI_BIN" >&2; exit 2; }
command -v "$CODEX_BIN" >/dev/null || { echo "No existe CODEX_BIN=$CODEX_BIN" >&2; exit 2; }
command -v gh >/dev/null || { echo "Se requiere gh para crear el PR" >&2; exit 2; }

send_email() {
  local status="$1"
  local files="${2:-sin cambios detectados}"
  local judge="${judge_output:-El juez todavía no emitió dictamen.}"
  [[ -n "${RESEND_API_KEY:-}" ]] || return 0
  local subject="[GaesPOS] Ciclo autónomo ${status}"
  local text="Ciclo autónomo: ${status}\n\nPantallas/áreas revisadas:\n${files}\n\nQué se pidió/resolvió:\n${TASK_PROMPT}\n\nDictamen Codex:\n${judge}\n\nRama: ${branch:-no creada}"
  local html="<h2>Ciclo autónomo: ${status}</h2><h3>Pantallas/áreas revisadas</h3><pre>${files}</pre><h3>Qué se pidió/resolvió</h3><p>${TASK_PROMPT}</p><h3>Dictamen Codex</h3><pre>${judge}</pre><p>Rama: ${branch:-no creada}</p>"
  curl -fsS https://api.resend.com/emails \
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

kimi_prompt=$(cat <<EOF
Eres el ejecutor Kimi. Implementa esta tarea en el repositorio actual:
$TASK_PROMPT

Reglas: no hagas push, no hagas deploy, no ejecutes migraciones, no modifiques secretos.
Ejecuta las pruebas relevantes y deja los cambios en el worktree.
EOF
)
"$KIMI_BIN" --auto -p "$kimi_prompt" --output-format text

git diff --check
pnpm --filter @gaespos/web-tienda typecheck
pnpm --filter @gaespos/web-tienda build
pnpm --filter @gaespos/mobile-cliente typecheck
pnpm --filter @gaespos/mobile-cliente test -- --run

judge_prompt=$(cat <<'EOF'
Eres el juez Codex. Revisa exclusivamente el diff actual como revisor adversarial.
Verifica alcance, tenant isolation, precios, imágenes, accesibilidad, tests y regresiones.
Responde en la primera línea exactamente APPROVED o REJECTED y después enumera evidencia y correcciones.
Aprueba solo si el cambio está listo para merge.
EOF
)
judge_output=$("$CODEX_BIN" exec --sandbox read-only --ephemeral "$judge_prompt" 2>&1 | tee /tmp/codex-judge.txt)
printf '%s\n' "$judge_output" | grep -q '^APPROVED$' || {
  echo "Codex rechazó el cambio; no se publica ni se fusiona." >&2
  exit 1
}

git add -A
git diff --cached --quiet && { echo "No hubo cambios para publicar."; exit 0; }
git commit -m "chore(automation): apply approved storefront cycle"
git push --set-upstream origin "$branch"
pr_url=$(gh pr create --base main --head "$branch" --title "Automated storefront cycle" --body-file /tmp/codex-judge.txt)
echo "PR creado: $pr_url"

if [[ "$AUTO_MERGE" == "true" ]]; then
  gh pr merge "$pr_url" --squash --auto --delete-branch
else
  echo "AUTO_MERGE no está activo; el PR queda esperando revisión humana."
fi
