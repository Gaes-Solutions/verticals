"""Fail closed when Android runtime sources differ from the signed QA binaries."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / 'scripts/testing/android-staging-artifacts.json').read_text())
common = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json']
for kind, app in [('client', 'mobile-cliente'), ('kiosk', 'mobile-kiosko')]:
    base = f'apps/{app}'
    exact = set(common + [f'{base}/{name}' for name in ['app.config.ts', 'package.json', 'metro.config.js', 'eas.json', 'tsconfig.json']] + ['packages/api-client/package.json', 'packages/api-client/tsconfig.json'])
    tracked = subprocess.check_output(['git', 'ls-files', '-z', base, 'packages/api-client', 'patches', *common], cwd=root).decode().split('\0')
    paths = sorted(p for p in tracked if p and (p in exact or p.startswith((f'{base}/app/', f'{base}/src/', f'{base}/assets/', 'packages/api-client/src/')) or (p.startswith('patches/') and p.endswith('.patch'))))
    digest = hashlib.sha256()
    for name in paths:
        file = root / name
        if file.is_symlink() or not file.is_file():
            raise SystemExit('Invalid native source file')
        digest.update(name.encode() + b'\0' + hashlib.sha256(file.read_bytes()).digest())
    expected = manifest['source'][kind]
    if len(paths) != expected['files'] or digest.hexdigest() != expected['sha256']:
        raise SystemExit(f'{kind}: runtime sources changed; rebuild the APK before claiming these sources passed Android QA')
    print(f'PASS {kind}: {len(paths)} runtime files match the signed APK source inventory')
