#!/usr/bin/env bash
set -euo pipefail

: "${KIMI_BIN:=kimi}"
: "${CODEX_BIN:=codex}"
: "${AUTO_MERGE:=false}"
: "${TASK_PROMPT:=Revisa y mejora el storefront de la tienda. Trabaja solo en el frontend, conserva el aislamiento multi-tenant, agrega pruebas relevantes y no cambies secretos, migraciones ni despliegues.}"

command -v "$KIMI_BIN" >/dev/null || { echo "No existe KIMI_BIN=$KIMI_BIN" >&2; exit 2; }
command -v "$CODEX_BIN" >/dev/null || { echo "No existe CODEX_BIN=$CODEX_BIN" >&2; exit 2; }
command -v gh >/dev/null || { echo "Se requiere gh para crear el PR" >&2; exit 2; }

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
