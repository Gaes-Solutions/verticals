"""Resolve verified QA APKs from their published release or immutable bootstrap payload."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / 'scripts/testing/android-staging-artifacts.json').read_text())
native = Path(os.environ['RUNNER_TEMP']) / 'native'
native.mkdir(parents=True, exist_ok=True)
repo = os.environ['GITHUB_REPOSITORY']

def gh(*args):
    try:
        return subprocess.check_output(['gh', *args], stderr=subprocess.PIPE, timeout=300)
    except subprocess.SubprocessError:
        raise SystemExit('GitHub artifact operation failed; refusing an unverified fallback') from None

def verify():
    for kind in ('client', 'kiosk'):
        file = native / f'{kind}.apk'
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != manifest[kind]['sha256']:
            raise SystemExit(f'{kind}: APK integrity check failed')
    print('PASS both signed APK SHA256 digests')

if sys.argv[1:] == ['payload']:
    for kind in ('client', 'kiosk'):
        shutil.copyfile(root / '.native-apk-payload' / manifest[kind]['filename'], native / f'{kind}.apk')
    verify()
else:
    pages = json.loads(gh('api', '--paginate', '--slurp', f'repos/{repo}/releases?per_page=100'))
    release = next((item for page in pages for item in page if item['tag_name'] == manifest['release']['tag']), None)
    published = release is not None and not release['draft']
    if published:
        expected = manifest['release']
        ref = json.loads(gh('api', f"repos/{repo}/git/ref/tags/{expected['tag']}"))
        if (release['name'] != expected['title'] or not release['prerelease'] or ref['object']['type'] != 'commit' or ref['object']['sha'] != expected['sourceCommit']):
            raise SystemExit('Published QA release identity does not match the signed sources')
        for kind in ('client', 'kiosk'):
            filename = manifest[kind]['filename']
            gh('release', 'download', expected['tag'], '--repo', repo, '--pattern', filename, '--dir', str(native), '--clobber')
            (native / filename).replace(native / f'{kind}.apk')
        verify()
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f'payload={str(not published).lower()}\n')
