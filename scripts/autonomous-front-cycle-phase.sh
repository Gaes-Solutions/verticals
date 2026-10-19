#!/usr/bin/env bash
set -euo pipefail

# Controlador por fases. Cada fase recibe solo las credenciales que necesita:
# executor=Kimi, judge=OpenAI, publisher=GitHub/correo. Los artefactos son un
# patch binario y metadata ligada por hashes; nunca se transfieren entornos.

: "${AUTONOMY_PHASE:?AUTONOMY_PHASE es requerido}"
: "${BACKLOG_FILE:=automation/front-backlog.md}"
: "${KIMI_TIMEOUT:=8m}"
: "${CODEX_TIMEOUT:=5m}"
: "${AUTO_MERGE:=false}"
: "${ARTIFACT_DIR:=${RUNNER_TEMP:-/tmp}/gaes-autonomy-artifact}"
: "${CONTROLLER_VERSION:=2026-10-19-v2}"

die() { echo "autonomy: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "no existe $1"; }

base_sha="$(git rev-parse HEAD)"
[[ "$base_sha" =~ ^[0-9a-f]{40}$ ]] || die "HEAD inválido"

task_line="$(grep -m1 -E '^- \[ \] ST-[0-9]+ \|' "$BACKLOG_FILE" || true)"
if [[ "$AUTONOMY_PHASE" == executor && "${AUTONOMY_PREFLIGHT_WAITING:-false}" == true && -f "$ARTIFACT_DIR/waiting-review" ]]; then exit 0; fi
if [[ -z "$task_line" ]]; then
  [[ ! -f "$ARTIFACT_DIR/no-work" || "$AUTONOMY_PHASE" == executor ]] || exit 0
  mkdir -p "$ARTIFACT_DIR"; printf '%s\n' no-work > "$ARTIFACT_DIR/no-work"; exit 0
fi
[[ ! -f "$ARTIFACT_DIR/no-work" ]] || die "marcador no-work inválido mientras hay una tarea pendiente"
task_id="$(printf '%s' "$task_line" | sed -E 's/^- \[ \] (ST-[0-9]+) \|.*/\1/')"
[[ "$task_id" =~ ^ST-[0-9]+$ ]] || die "no hay tarea pendiente"

allowed_path() {
  local p="$1"
  [[ "$p" == apps/web-tienda/src/* || "$p" == apps/web-tienda/test/* || \
    "$p" == apps/web-tienda/tests/* || "$p" == apps/web-tienda/public/* || \
    ("$task_id" == ST-006 && ("$p" == apps/mobile-cliente/app/* || "$p" == apps/mobile-cliente/src/* || "$p" == apps/mobile-cliente/assets/* || "$p" == apps/mobile-cliente/test/* || "$p" == apps/mobile-cliente/tests/*)) ]]
}

scope_gate() {
  python3 - "$base_sha" "$task_id" <<'PY'
import hashlib, subprocess, sys
from pathlib import Path
base, task = sys.argv[1:]
allowed = ['apps/web-tienda/src/', 'apps/web-tienda/test/', 'apps/web-tienda/tests/', 'apps/web-tienda/public/']
if task == 'ST-006':
    allowed += ['apps/mobile-cliente/app/', 'apps/mobile-cliente/src/', 'apps/mobile-cliente/assets/', 'apps/mobile-cliente/test/', 'apps/mobile-cliente/tests/']
if subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() != base:
    raise SystemExit('HEAD cambió durante la fase')
tracked = subprocess.check_output(['git', 'diff', '--no-renames', '--name-only', '-z', base, '--'])
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'])
staged = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z', base, '--'])
for raw in sorted(set((tracked + untracked + staged).split(b'\0'))):
    if not raw: continue
    p = raw.decode()
    sensitive = any(part.startswith('.env') or part in {'.github', 'migrations'} for part in Path(p).parts)
    sensitive |= Path(p).suffix.lower() in {'.jks', '.keystore', '.p12', '.pem', '.key'}
    linked = any(part.is_symlink() for part in (Path(p), *Path(p).parents))
    if not p.startswith(tuple(allowed)) or sensitive or linked:
        raise SystemExit(f'fuera de alcance o sensible: {p}')
print('scope-ok')
PY
}

run_timeout() {
  local duration="$1"; shift
  timeout --signal=TERM --kill-after=30s "$duration" "$@"
}

reject_secret_leak() {
  local file="$1"
  SECRET_FILE="$file" python3 - <<'PY'
import os
from pathlib import Path
p = Path(os.environ['SECRET_FILE'])
data = p.read_bytes()
for name in ('KIMI_MODEL_API_KEY', 'KIMI_API_KEY', 'OPENAI_API_KEY', 'GH_TOKEN', 'RESEND_API_KEY', 'BREVO_API_KEY'):
    value = os.environ.get(name, '')
    if value and value.encode() in data:
        raise SystemExit('contenido sensible detectado en artefacto')
PY
}

write_metadata() {
  local patch="$1"
  mkdir -p "$ARTIFACT_DIR"
  sha256sum "$patch" | awk '{print $1}' > "$ARTIFACT_DIR/patch.sha256"
  PATCH_PATH="$patch" BASE_SHA="$base_sha" TASK_ID="$task_id" CONTROLLER_VERSION="$CONTROLLER_VERSION" ARTIFACT_DIR="$ARTIFACT_DIR" python3 - <<'PY'
import json, os
from pathlib import Path
a = Path(os.environ['ARTIFACT_DIR'])
paths = []
for line in Path(os.environ['PATCH_PATH']).read_text(errors='replace').splitlines():
    if line.startswith(('--- a/', '+++ b/')) and line[6:] != '/dev/null': paths.append(line[6:])
    elif line.startswith('diff --git '):
        parts = line.split()
        if len(parts) == 4 and parts[2].startswith('a/') and parts[3].startswith('b/'):
            paths.extend([parts[2][2:], parts[3][2:]])
json.dump({'base_sha': os.environ['BASE_SHA'], 'task_id': os.environ['TASK_ID'], 'paths': sorted(set(paths)),
           'patch_sha256': (a/'patch.sha256').read_text().strip(),
           'controller_version': os.environ['CONTROLLER_VERSION']}, (a/'metadata.json').open('w'), indent=2)
PY
}

state_fingerprint() {
  python3 - <<'PY'
import hashlib, subprocess
from pathlib import Path
h = hashlib.sha256()
for args in (['git','rev-parse','HEAD'], ['git','diff','--binary','--no-ext-diff','--no-renames','HEAD','--'], ['git','diff','--cached','--binary','--no-ext-diff','--no-renames','HEAD','--']):
    h.update(subprocess.check_output(args)); h.update(b'\0')
for p in (Path('.git/config'), Path('scripts/autonomous-front-cycle-phase.sh')):
    if p.is_file(): h.update(str(p).encode() + b'\0' + hashlib.sha256(p.read_bytes()).digest())
stages = {}
for record in subprocess.check_output(['git','ls-files','--stage','-z']).split(b'\0'):
    if record:
        value, raw = record.split(b'\t', 1); stages[raw.decode()] = value.decode()
flags = {}
for record in subprocess.check_output(['git','ls-files','-v','-z']).split(b'\0'):
    if record: flags[record[2:].decode()] = record[:1]
for raw in sorted(x for x in subprocess.check_output(['git','ls-files','-z']).split(b'\0') if x):
    p = Path(raw.decode()); h.update(b'tracked\0' + raw + b'\0')
    h.update(stages.get(str(p), '').encode() + b'\0')
    h.update(flags.get(str(p), b'?'))
    if p.is_symlink(): h.update(b'symlink\0' + str(p.readlink()).encode())
    elif p.is_file(): h.update(str(p.stat().st_mode).encode()); h.update(hashlib.sha256(p.read_bytes()).digest())
    else: h.update(b'missing')
for raw in sorted(x for x in subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z']).split(b'\0') if x):
    p = Path(raw.decode()); h.update(raw); h.update(b'\0')
    if p.is_symlink(): h.update(b'symlink\0' + str(p.readlink()).encode())
    elif p.is_file(): h.update(hashlib.sha256(p.read_bytes()).digest())
    else: h.update(b'other')
print(h.hexdigest())
PY
}

artifact_fingerprint() {
  python3 - "$ARTIFACT_DIR" <<'PY'
import hashlib, pathlib, sys
a = pathlib.Path(sys.argv[1]); h = hashlib.sha256()
for name in ('patch', 'metadata.json', 'patch.sha256', 'validation.json', 'validated-base.sha'):
    p = a / name
    h.update(name.encode() + b'\0')
    if p.exists(): h.update(hashlib.sha256(p.read_bytes()).digest())
    else: h.update(b'<missing>')
print(h.hexdigest())
PY
}

verify_artifact() {
  [[ -f "$ARTIFACT_DIR/metadata.json" && -f "$ARTIFACT_DIR/patch" && -f "$ARTIFACT_DIR/patch.sha256" ]] || die "artefacto incompleto"
  ARTIFACT_DIR="$ARTIFACT_DIR" BASE_SHA="$base_sha" TASK_ID="$task_id" CONTROLLER_VERSION="$CONTROLLER_VERSION" python3 - <<'PY'
import hashlib, json, os, subprocess
from pathlib import Path
a = Path(os.environ['ARTIFACT_DIR'])
m = json.loads((a/'metadata.json').read_text())
if m.get('base_sha') != os.environ['BASE_SHA']: raise SystemExit('base SHA no coincide')
if not isinstance(m.get('task_id'), str) or not m['task_id'].startswith('ST-'): raise SystemExit('task id inválido')
if m.get('controller_version') != os.environ.get('CONTROLLER_VERSION', '2026-10-19-v2'): raise SystemExit('version del controlador no coincide')
if not isinstance(m.get('paths'), list) or not m['paths']: raise SystemExit('paths ausentes')
h = hashlib.sha256((a/'patch').read_bytes()).hexdigest()
if h != m.get('patch_sha256') or h != (a/'patch.sha256').read_text().strip(): raise SystemExit('hash de patch no coincide')
if m.get('task_id') != os.environ.get('TASK_ID', m.get('task_id')): raise SystemExit('task id no coincide')
PY
  # Preflight del patch antes de tocar el índice: no se aceptan rutas fuera del
  # alcance ni parches que creen enlaces simbólicos. scope_gate vuelve a revisar
  # lo aplicado después, con el checkout real.
  PATCH="$ARTIFACT_DIR/patch" TASK_ID="$task_id" python3 - <<'PY'
import os, re, json
from pathlib import PurePosixPath
patch = open(os.environ['PATCH'], encoding='utf-8', errors='strict').read().splitlines()
task = os.environ['TASK_ID']
allowed = ['apps/web-tienda/src/', 'apps/web-tienda/test/', 'apps/web-tienda/tests/', 'apps/web-tienda/public/']
if task == 'ST-006':
    allowed += ['apps/mobile-cliente/app/', 'apps/mobile-cliente/src/', 'apps/mobile-cliente/assets/', 'apps/mobile-cliente/test/', 'apps/mobile-cliente/tests/']
paths = []
def sensitive(p):
    q = PurePosixPath(p)
    return any(part.startswith('.env') or part in {'.github', 'migrations'} for part in q.parts) or q.suffix.lower() in {'.jks', '.keystore', '.p12', '.pem', '.key'}
for line in patch:
    if line.startswith('diff --git '):
        if '"' in line or '\\' in line: raise SystemExit('path quoted/escapada en patch')
        parts = line.split()
        if len(parts) != 4 or not parts[2].startswith('a/') or not parts[3].startswith('b/'):
            raise SystemExit('cabecera diff inválida')
        paths.extend([parts[2][2:], parts[3][2:]])
    elif line.startswith(('rename from ', 'rename to ', 'copy from ', 'copy to ')):
        raise SystemExit('rename/copy no permitido')
    if line.startswith(('--- a/', '+++ b/')):
        p = line[6:]
        if p == '/dev/null': continue
        if p.startswith('/') or '/../' in f'/{p}' or p == '..' or p.startswith('../'):
            raise SystemExit(f'ruta peligrosa en patch: {p}')
        paths.append(p)
if not paths or any(sensitive(p) or not p.startswith(tuple(allowed)) for p in paths):
    raise SystemExit('ruta fuera de alcance en patch')
meta = json.load(open(os.path.join(os.path.dirname(os.environ['PATCH']), 'metadata.json')))
if sorted(set(paths)) != sorted(set(meta.get('paths', []))): raise SystemExit('paths no coinciden con metadata')
if any(re.search(r'\b(?:new|old)(?: file)? mode 120000\b', line) for line in patch):
    raise SystemExit('symlink en patch no permitido')
PY
  git apply --check "$ARTIFACT_DIR/patch"
}

case "$AUTONOMY_PHASE" in
  executor)
    need "${KIMI_BIN:=kimi}"
    [[ -n "${KIMI_MODEL_API_KEY:-}" && -n "${KIMI_MODEL_NAME:-}" ]] || die "KIMI_MODEL_API_KEY y KIMI_MODEL_NAME requeridos; no se usa autenticación desde HOME"
    rm -rf "$ARTIFACT_DIR"
    prompt="Tarea $task_id: ${task_line#*| }. Implementa solo esta tarea frontend y sus pruebas. No hagas commits, staging, push, deploy, migraciones ni leas secretos. Deja cambios en el worktree."
    # Kimi conserva únicamente su propio proveedor; los tokens de publicación,
    # correo y Codex nunca llegan al proceso del agente.
    env -i PATH="$PATH" HOME="${HOME:-}" KIMI_MODEL_API_KEY="$KIMI_MODEL_API_KEY" KIMI_MODEL_NAME="$KIMI_MODEL_NAME" KIMI_MODEL_BASE_URL="${KIMI_MODEL_BASE_URL:-}" \
      timeout --signal=TERM --kill-after=30s "$KIMI_TIMEOUT" "$KIMI_BIN" -p "$prompt" --output-format text
    [[ "$(git rev-parse HEAD)" == "$base_sha" ]] || die "Kimi cambió HEAD"
    scope_gate
    # El agente no puede precrear resultados ni marcadores en el directorio de
    # transferencia. Solo el controlador confiable escribe los artefactos.
    rm -rf "$ARTIFACT_DIR"
    # Incluye archivos nuevos permitidos en el patch sin aceptar staging ajeno.
    while IFS= read -r -d '' path; do git add -N -- "$path"; done < <(git ls-files --others --exclude-standard -z)
    mkdir -p "$ARTIFACT_DIR"
    git diff --binary --no-renames "$base_sha" -- > "$ARTIFACT_DIR/patch"
    reject_secret_leak "$ARTIFACT_DIR/patch"
    write_metadata "$ARTIFACT_DIR/patch"
    ;;
  validate)
    need git; need pnpm
    [[ "${AUTONOMY_VALIDATE_ISOLATED:-false}" == true ]] || die "validate requiere aislamiento Docker; readiness desconocido"
    verify_artifact
    artifact_before="$(artifact_fingerprint)"
    git apply --index "$ARTIFACT_DIR/patch"
    scope_gate
    before_state="$(state_fingerprint)"
    git diff --check
    run_product_checks() {
      pnpm --filter @gaespos/web-tienda typecheck
      pnpm --filter @gaespos/web-tienda exec vitest run
      pnpm --filter @gaespos/web-tienda build
      if [[ "$task_id" == ST-006 ]]; then
        pnpm --filter @gaespos/mobile-cliente typecheck
        pnpm --filter @gaespos/mobile-cliente test -- --run
      fi
    }
    if [[ "${AUTONOMY_VALIDATE_TEST_MODE:-false}" == true ]]; then
      run_product_checks
    else
      need docker
      validate_image="${AUTONOMY_VALIDATE_IMAGE:-node:24-bookworm-slim@sha256:ec857ea6bb60cb3d0fa4d97495590c5fe7d51be8572c307b55957eeb06569cf7}"
      isolated_dir="$(mktemp -d "${TMPDIR:-/tmp}/gaes-validate.XXXXXX")"
      trap 'rm -rf "$isolated_dir"; [[ -z "${source_inventory:-}" ]] || rm -f "$source_inventory"' EXIT
      tar --exclude='./.git' --exclude='./scripts/autonomous-front-cycle-phase.sh' -cf - . | tar -xf - -C "$isolated_dir"
      find "$isolated_dir" -type f -name '.env*' -delete
      isolated_source_fingerprint() {
        python3 - "$1" "$2" <<'PY'
import hashlib, pathlib, sys
root = pathlib.Path(sys.argv[1]); inventory = pathlib.Path(sys.argv[2]); h = hashlib.sha256()
tracked = [x for x in inventory.read_bytes().split(b'\0') if x]
for raw in sorted(tracked):
    p = root / raw.decode(); h.update(b'tracked\0' + raw + b'\0')
    if p.is_symlink(): h.update(b'link:' + str(p.readlink()).encode())
    elif p.is_file(): h.update(str(p.stat().st_mode).encode() + b'\0' + hashlib.sha256(p.read_bytes()).digest())
    else: h.update(b'missing')
def generated_untracked(rel):
    parts = rel.parts
    if 'node_modules' in parts or rel.name in {'tsconfig.tsbuildinfo', 'next-env.d.ts'} or rel.name.endswith('.tsbuildinfo'): return True
    output_names = {'.next', 'dist', 'coverage', 'build'}
    return any(i in (0, 2) and part in output_names for i, part in enumerate(parts))
tracked_set = {x.decode() for x in tracked}
for p in sorted((p for p in root.rglob('*') if (p.is_file() or p.is_symlink())), key=str):
    rel = p.relative_to(root)
    if str(rel) in tracked_set or generated_untracked(rel): continue
    h.update(b'unexpected\0' + str(rel).encode() + b'\0')
    h.update((b'link:' + str(p.readlink()).encode()) if p.is_symlink() else hashlib.sha256(p.read_bytes()).digest())
print(h.hexdigest())
PY
      }
      source_inventory="$(mktemp "${TMPDIR:-/tmp}/gaes-validate-inventory.XXXXXX")"
      git ls-files -z > "$source_inventory"
      isolated_before="$(isolated_source_fingerprint "$isolated_dir" "$source_inventory")"
      pnpm_real="$(readlink -f "$(command -v pnpm)")"
      case "$pnpm_real" in
        */bin/pnpm.cjs) pnpm_runtime_root="$(dirname "$(dirname "$pnpm_real")")"; pnpm_entry='bin/pnpm.cjs'; corepack_mount=0 ;;
        */corepack/dist/pnpm.js) pnpm_runtime_root="$(dirname "$(dirname "$pnpm_real")")"; pnpm_entry='dist/pnpm.js'; corepack_mount=1 ;;
        *) die "entrada pnpm no soportada para Docker: $pnpm_real" ;;
      esac
      docker_mounts=(-v "$isolated_dir:/workspace:rw" -v "$pnpm_runtime_root:/opt/pnpm-runtime:ro")
      docker_env=(-e CI=true -e HOME=/tmp/empty)
      if [[ "$corepack_mount" == 1 ]]; then
        corepack_cache="${COREPACK_HOME:-${HOME:-/tmp}/.cache/node/corepack}"
        [[ -d "$corepack_cache" ]] || die "cache local de pnpm ausente para Docker sin red"
        docker_env+=(-e COREPACK_HOME=/opt/corepack-cache)
        docker_mounts+=(-v "$corepack_cache:/opt/corepack-cache:ro")
      fi
      docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
        --user "$(id -u):$(id -g)" --pids-limit 512 --memory 6g --cpus 4 "${docker_env[@]}" \
        "${docker_mounts[@]}" -w /workspace "$validate_image" bash -euo pipefail -c \
        "mkdir -p \"\$HOME\"; node /opt/pnpm-runtime/$pnpm_entry --version; node /opt/pnpm-runtime/$pnpm_entry --filter @gaespos/web-tienda typecheck; node /opt/pnpm-runtime/$pnpm_entry --filter @gaespos/web-tienda exec vitest run; node /opt/pnpm-runtime/$pnpm_entry --filter @gaespos/web-tienda build"
      if [[ "$task_id" == ST-006 ]]; then
        docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
          --user "$(id -u):$(id -g)" --pids-limit 512 --memory 6g --cpus 4 "${docker_env[@]}" \
          "${docker_mounts[@]}" -w /workspace "$validate_image" bash -euo pipefail -c \
          "mkdir -p \"\$HOME\"; node /opt/pnpm-runtime/$pnpm_entry --filter @gaespos/mobile-cliente typecheck; node /opt/pnpm-runtime/$pnpm_entry --filter @gaespos/mobile-cliente test -- --run"
      fi
      [[ "$isolated_before" == "$(isolated_source_fingerprint "$isolated_dir" "$source_inventory")" ]] || die "checks modificaron la copia fuente aislada"
    fi
    git diff --cached --check
    [[ "$(artifact_fingerprint)" == "$artifact_before" ]] || die "checks modificaron el artefacto aprobado"
    after_state="$(state_fingerprint)"
    [[ "$before_state" == "$after_state" ]] || die "checks modificaron HEAD, índice, worktree o untracked"
    python3 - "$ARTIFACT_DIR/metadata.json" "$base_sha" "$task_id" "$CONTROLLER_VERSION" "$after_state" <<'PY'
import json, sys
meta, base, task, version, state = sys.argv[1:]
m = json.load(open(meta))
json.dump({'base_sha': base, 'task_id': task, 'patch_sha256': m['patch_sha256'], 'controller_version': version, 'state_fingerprint': state}, open(meta.replace('metadata.json', 'validation.json'), 'w'), indent=2)
PY
    printf '%s\n' "$base_sha" > "$ARTIFACT_DIR/validated-base.sha"
    ;;
  judge)
    need git; need "${CODEX_BIN:=codex}"
    [[ -n "${OPENAI_API_KEY:-}" || "${CODEX_AUTH_READY:-}" == true ]] || die "OPENAI_API_KEY o CODEX_AUTH_READY requerido"
    verify_artifact
    artifact_before="$(artifact_fingerprint)"
    git apply --index "$ARTIFACT_DIR/patch"
    scope_gate
    [[ -f "$ARTIFACT_DIR/validation.json" ]] || die "evidencia de validación ausente"
    python3 - "$ARTIFACT_DIR/metadata.json" "$ARTIFACT_DIR/validation.json" "$CONTROLLER_VERSION" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); v = json.load(open(sys.argv[2]))
if any(v.get(k) != m.get(k) for k in ('base_sha', 'task_id', 'patch_sha256')) or v.get('controller_version') != sys.argv[3]: raise SystemExit('validación no ligada al patch')
PY
    before_state="$(state_fingerprint)"
    snapshot="$(git diff --cached --binary --no-ext-diff --no-renames HEAD -- | sha256sum | awk '{print $1}')"
    out="$ARTIFACT_DIR/judge.txt"
    prompt='Revisa solo el cambio staged de esta tarea. No modifiques archivos, no hagas commits, no hagas staging, no ejecutes pruebas/build/lint y no uses red. Responde en la primera línea exactamente APPROVED o REJECTED y después evidencia. Verifica alcance, aislamiento multi-tenant, precios, imágenes, accesibilidad y regresiones.'
      env -i PATH="$PATH" HOME="${HOME:-}" CODEX_HOME="${CODEX_HOME:-}" CODEX_AUTH_READY="${CODEX_AUTH_READY:-}" \
      timeout --signal=TERM --kill-after=30s "$CODEX_TIMEOUT" "$CODEX_BIN" exec --sandbox read-only --ephemeral --output-last-message "$out" "$prompt"
    [[ "$(git rev-parse HEAD)" == "$base_sha" ]] || die "juez cambió HEAD"
    after="$(git diff --cached --binary --no-ext-diff --no-renames HEAD -- | sha256sum | awk '{print $1}')"
    [[ "$snapshot" == "$after" ]] || die "juez modificó el snapshot"
    reject_secret_leak "$out"
    [[ "$(head -n1 "$out")" == APPROVED ]] || die "juez rechazó el cambio"
    [[ "$(artifact_fingerprint)" == "$artifact_before" ]] || die "juez modificó el artefacto aprobado"
    after_state="$(state_fingerprint)"
    [[ "$before_state" == "$after_state" ]] || die "juez modificó HEAD, índice, worktree o untracked"
    python3 - "$ARTIFACT_DIR/metadata.json" "$ARTIFACT_DIR/validation.json" "$out" "$CONTROLLER_VERSION" "$after_state" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); v = json.load(open(sys.argv[2])); out = sys.argv[3]
json.dump({'base_sha': m['base_sha'], 'task_id': m['task_id'], 'patch_sha256': m['patch_sha256'], 'controller_version': sys.argv[4], 'validation_state': v.get('state_fingerprint'), 'judge_state': sys.argv[5], 'decision': open(out).read().splitlines()[0]}, open(out.replace('judge.txt', 'judgment.json'), 'w'), indent=2)
PY
    ;;
  publish)
    need git; need gh
    [[ -n "${GH_TOKEN:-}" ]] || die "GH_TOKEN requerido en publisher"
    verify_artifact
    [[ -f "$ARTIFACT_DIR/validated-base.sha" && -f "$ARTIFACT_DIR/validation.json" && -f "$ARTIFACT_DIR/judge.txt" && -f "$ARTIFACT_DIR/judgment.json" ]] || die "faltan validación o dictamen"
    [[ "$(cat "$ARTIFACT_DIR/validated-base.sha")" == "$base_sha" ]] || die "base validada distinta"
    [[ "$(head -n1 "$ARTIFACT_DIR/judge.txt")" == APPROVED ]] || die "dictamen no aprobado"
    python3 - "$ARTIFACT_DIR/metadata.json" "$ARTIFACT_DIR/validation.json" "$ARTIFACT_DIR/judgment.json" "$CONTROLLER_VERSION" <<'PY'
import json, sys
m=json.load(open(sys.argv[1])); v=json.load(open(sys.argv[2])); j=json.load(open(sys.argv[3]))
for x in (v, j):
    if any(x.get(k) != m.get(k) for k in ('base_sha','task_id','patch_sha256')) or x.get('controller_version') != sys.argv[4]: raise SystemExit('evidencia no ligada al patch')
if j.get('decision') != 'APPROVED': raise SystemExit('dictamen no aprobado')
if j.get('validation_state') != v.get('state_fingerprint'): raise SystemExit('dictamen no ligado a la validación')
PY
    git apply --index "$ARTIFACT_DIR/patch"
    scope_gate
    git config user.name "GaesSoft Automation"
    git config user.email "automation@gaessoft.com"
    branch="automation/front-cycle-${GITHUB_RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}-${GITHUB_RUN_ATTEMPT:-1}"
    git switch -c "$branch"
    python3 - "$BACKLOG_FILE" "$task_id" <<'PY'
from pathlib import Path
import sys
p, task = Path(sys.argv[1]), sys.argv[2]
lines = p.read_text().splitlines()
for i, line in enumerate(lines):
    if line.startswith(f'- [ ] {task} |'):
        lines[i] = line.replace('- [ ]', '- [x]', 1); break
else: raise SystemExit('tarea no encontrada')
p.write_text('\n'.join(lines) + '\n')
PY
    # La validación de producto ya terminó; publisher solo procesa metadata,
    # patch y git. Nunca ejecuta package scripts después de recibir GH_TOKEN.
    python3 - "$ARTIFACT_DIR/metadata.json" <<'PY'
import json, sys
paths=json.load(open(sys.argv[1])).get('paths', [])
if not paths or any('\n' in p or '\r' in p for p in paths): raise SystemExit('paths inválidos')
open(sys.argv[1].replace('metadata.json', 'paths.txt'), 'w').write('\n'.join(paths) + '\n')
PY
    git add --pathspec-from-file="$ARTIFACT_DIR/paths.txt"
    git add -- "$BACKLOG_FILE"
    git -c core.hooksPath=/dev/null commit -m "chore(automation): apply approved storefront cycle"
    GH_TOKEN="$GH_TOKEN" gh auth setup-git
    git push --set-upstream origin "$branch"
    if pr_url=$(GH_TOKEN="$GH_TOKEN" gh pr create --base main --head "$branch" --title "Automated storefront cycle" --body-file "$ARTIFACT_DIR/judge.txt" 2>&1); then
      echo "PR creado: $pr_url"
      if [[ -n "${RESEND_API_KEY:-}${BREVO_API_KEY:-}" && -n "${INCIDENT_ALERT_EMAIL:-}" && -n "${EMAIL_REMITENTE:-}" ]]; then
        if ! python3 - "$task_id" "$pr_url" "$ARTIFACT_DIR/patch.sha256" <<'PY' | python3 scripts/send-system-email.py
import json, os, sys
task, pr, digest_path = sys.argv[1:]
digest = open(digest_path).read().strip()
json.dump({
    'subject': f'GaesSoft automation: PR publicado ({task})',
    'text': f'Pantalla: storefront frontend ({task})\nEstado: PR creado, pendiente de revisión/merge (no se afirma integración).\nPR: {pr}\nPatch: {digest}\nPruebas: typecheck, vitest y build pasaron en validate; el juez emitió APPROVED.\nPara probar: abre el PR y ejecuta el flujo de la tarea en staging.',
}, sys.stdout)
PY
        then
          echo "Aviso por correo no confirmado; el PR ya fue creado" >&2
        fi
      else
        echo "Aviso por correo omitido: proveedor, destinatario o remitente no configurado" >&2
      fi
      if [[ "$AUTO_MERGE" == true && "$pr_url" == https://github.com/*/pull/* ]]; then
        GH_TOKEN="$GH_TOKEN" gh pr merge "$pr_url" --squash --auto --delete-branch
      fi
    else
      echo "No se pudo crear PR; rama publicada: $branch" >&2
      exit 1
    fi
    ;;
  *) die "fase desconocida: $AUTONOMY_PHASE" ;;
esac
