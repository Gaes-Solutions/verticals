#!/usr/bin/env python3
"""Prepare a private subscription-only worker; no model calls and no API-key fallback."""
import json
import os
import shutil
import stat
import subprocess
from pathlib import Path


def prepare(home=Path.home(), source=Path(__file__).resolve().parent.parent):
    state=home/'.local/share/gaes-incident-local'
    if any(p.is_symlink() for p in (state,*state.parents)):
        raise ValueError('unsafe installation path')
    state.mkdir(parents=True,exist_ok=True,mode=0o700)
    os.chmod(state,0o700)
    for name in ('controller','controller/scripts','controller/automation','credentials','chatgpt','runs'):
        (state/name).mkdir(parents=True,exist_ok=True,mode=0o700)
        os.chmod(state/name,0o700)
    auth=home/'.codex/auth.json'
    fd=os.open(auth,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as f:
        mode=os.fstat(f.fileno())
        if not stat.S_ISREG(mode.st_mode) or mode.st_uid!=os.getuid() or mode.st_mode&0o077 or mode.st_size>65536:
            raise ValueError('private ChatGPT login required')
        raw=f.read(65537); data=json.loads(raw)
    if data.get('auth_mode')!='chatgpt' or data.get('OPENAI_API_KEY') or not isinstance(data.get('tokens'),dict):
        raise ValueError('ChatGPT subscription login required')
    def private_write(path,content):
        if path.exists():
            if path.is_symlink() or not path.is_file(): raise ValueError('unsafe private file')
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f:f.write(content)
        os.chmod(path,0o600)
    # Keep the dedicated worker's refreshed session across reinstalls.
    if not (state/'chatgpt/auth.json').exists(): private_write(state/'chatgpt/auth.json',raw)
    token=home/'.local/share/gaes-automation/incident-worker-token'
    if token.is_symlink() or not token.is_file() or token.stat().st_mode&0o077:
        raise ValueError('private incident bridge credential required')
    private_write(state/'credentials/incident-token',token.read_bytes())
    gh=subprocess.run(['gh','auth','token'],capture_output=True,timeout=20)
    if gh.returncode or not gh.stdout.strip():raise ValueError('GitHub login required')
    private_write(state/'credentials/github-token',gh.stdout.strip())
    names=['incident-local-worker.py','incident-egress-proxy.py','incident-worker-client.py',
           'codex-subscription-preflight.py','autonomous-incident-cycle-phase.sh','install-incident-local-service.py',
           'incident-release-audit.py', 'incident-media-sandbox.py','release-audit.py','incident-health.py','incident-pending-results.py']
    for name in names:
        destination=state/'controller/scripts'/name
        private_write(destination,(source/'scripts'/name).read_bytes())
    private_write(state/'controller/automation/release-audit-matrix.json',(source/'automation/release-audit-matrix.json').read_bytes())
    return state


if __name__=='__main__':
    try:
        state=prepare()
        print(json.dumps({'status':'prepared','state':str(state),'authentication':'chatgpt','apiFallback':False,'enabled':False}))
    except Exception:
        print(json.dumps({'status':'not_prepared','reason':'private_prerequisite_unavailable'}))
        raise SystemExit(1)
