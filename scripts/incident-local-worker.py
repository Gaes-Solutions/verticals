#!/usr/bin/env python3
"""Trusted local coordinator. Model and QA code execute only in restricted containers."""
import argparse
import fcntl
import importlib.util
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO = 'Gaes-Solutions/verticals'
IMAGE = 'gaes-incident-subscription:0.163.0-v1'
PG_IMAGE = 'postgres:16-alpine'


def clean_env(home):
    return {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(home), 'LANG': 'C.UTF-8', 'CI': 'true', 'GIT_TERMINAL_PROMPT': '0'}


def execute(args, *, cwd=None, env=None, timeout=60, accepted=(0,)):
    result = subprocess.run(args, cwd=cwd, env=env or clean_env('/tmp'), capture_output=True, timeout=timeout)
    if result.returncode not in accepted:
        raise RuntimeError('isolated command failed')
    return result.stdout


def cleanup(args):
    try:
        subprocess.run(args, capture_output=True, env=clean_env('/tmp'), timeout=30)
    except Exception:
        pass  # The next singleton cycle also recovers labelled orphan resources.


def private_file(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise RuntimeError('private credential unavailable')
    value = path.read_text().strip()
    if not value or '\n' in value or '\r' in value:
        raise RuntimeError('invalid credential')
    return value


def checkpoint(state, status, **details):
    allowed = {k: v for k, v in details.items() if k in ('reason', 'retryAt', 'remainingPercent', 'runId', 'incidentId', 'prUrl', 'phase')}
    payload = {'status': status, 'updatedAt': datetime.now(timezone.utc).isoformat(), **allowed}
    target = state / 'status.json'
    temporary = state / 'status.next'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(payload, f)
    temporary.replace(target)


class SubscriptionWait(Exception):
    def __init__(self, quota):
        self.quota = quota


class Worker:
    def __init__(self, state):
        self.state = state
        self.controller = state / 'controller'
        self.auth = state / 'chatgpt'
        self.credentials = state / 'credentials'
        self.scripts = self.controller / 'scripts'
        self.run = None
        self.artifacts = None
        self.run_id = str(uuid.uuid4())

    def container(self, mounts, env, command, *, network='bridge', timeout=60, accepted=(0,)):
        name = 'gaes-incident-role-' + str(uuid.uuid4())
        args = ['docker', 'run', '--rm', '--name', name, '--init', '--user', f'{os.getuid()}:{os.getgid()}',
                '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=384',
                '--label', 'gaes.incident.local=true', '--memory=6g', '--cpus=3', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=2g',
                '--network', network]
        for source, target, readonly in mounts:
            args += ['--mount', f'type=bind,source={source},target={target}' + (',readonly' if readonly else '')]
        for key, value in env.items():
            args += ['--env', f'{key}={value}']
        try:
            return execute([*args, IMAGE, *command], timeout=timeout, accepted=accepted)
        finally:
            cleanup(['docker', 'rm', '-f', name])

    def quota(self):
        raw = self.container([(self.controller, '/controller', True), (self.auth, '/local-worker/auth', False)],
                             {'HOME': '/local-worker/auth', 'CODEX_HOME': '/local-worker/auth'},
                             ['python3', '/controller/scripts/codex-subscription-preflight.py', '--codex-bin', '/usr/local/bin/codex', '--codex-home', '/local-worker/auth'], timeout=40, accepted=(0, 75, 77, 69))
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get('status') != 'ready':
            return data
        return data

    def clone(self, phase, sha=None):
        directory = self.run / phase
        home = self.run / ('git-home-' + phase)
        home.mkdir(mode=0o700)
        env = clean_env(home)
        token = private_file(self.credentials / 'github-token')
        import base64
        env.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='http.https://github.com/.extraheader',
                   GIT_CONFIG_VALUE_0='AUTHORIZATION: basic ' + base64.b64encode(('x-access-token:' + token).encode()).decode())
        try:
            execute(['git', '-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--no-checkout', '--single-branch', '--branch', 'staging', 'https://github.com/' + REPO + '.git', str(directory)], env=env, timeout=90)
        except (RuntimeError,subprocess.TimeoutExpired):
            if directory.is_symlink():raise RuntimeError('unsafe partial clone')
            if directory.exists():shutil.rmtree(directory)
            # Same repository, existing user key, strict pre-existing GitHub host key.
            # Port 443 recovers from intermittent HTTPS/SSH-22 routing failures.
            ssh_env=clean_env(home)
            ssh_env['GIT_SSH_COMMAND']='ssh -o HostKeyAlias=github.com -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2'
            execute(['git','-c','core.hooksPath=/dev/null','clone','--quiet','--no-checkout','--single-branch','--branch','staging','ssh://git@ssh.github.com:443/'+REPO+'.git',str(directory)],env=ssh_env,timeout=90)
        if sha is None:
            sha = execute(['git', 'rev-parse', 'origin/staging'], cwd=directory).decode().strip()
        if not re.fullmatch('[a-f0-9]{40}', sha):
            raise RuntimeError('untrusted base')
        execute(['git', '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', sha], cwd=directory)
        return directory, sha

    def transport(self, command, result=None):
        env = clean_env(self.run)
        env.update(INCIDENT_WORKER_TOKEN=private_file(self.credentials / 'incident-token'),
                   GITHUB_REPOSITORY=REPO, INCIDENT_LOCAL_RUN_ID=self.run_id)
        args = ['python3', str(self.scripts / 'incident-worker-client.py'), command, '--worker', str(self.artifacts / 'worker.json')]
        if result:
            args += ['--result', str(result)]
        return execute(args, env=env, timeout=40)

    def phase(self, name, directory, network='bridge'):
        mounts = [(self.controller, '/controller', True), (directory, '/workspace', False), (self.artifacts, '/artifacts', False)]
        env = {'HOME': '/tmp/worker-home', 'RUNNER_TEMP': '/local-worker', 'ARTIFACT_DIR': '/artifacts',
               'INCIDENT_WORKER_FILE': '/artifacts/worker.json', 'AUTONOMY_PHASE': name,
               'CODEX_AUTH_MODE': 'chatgpt', 'INCIDENT_FULL_RELEASE_AUDIT': 'true', 'INCIDENT_OUTER_SANDBOX': 'docker', 'GITHUB_REPOSITORY': REPO, 'INCIDENT_LOCAL_RUN_ID': self.run_id}
        command = ['bash', '/controller/scripts/autonomous-incident-cycle-phase.sh']
        if name in ('executor', 'judge'):
            quota = self.quota()
            if quota.get('status') != 'ready':
                raise SubscriptionWait(quota)
            role_auth = self.run / (name + '-auth')
            role_auth.mkdir(mode=0o700)
            shutil.copyfile(self.auth / 'auth.json', role_auth / 'auth.json')
            os.chmod(role_auth / 'auth.json', 0o600)
            mounts.append((role_auth, '/local-worker/auth', False))
            env.update(CODEX_AUTH_READY='true', CODEX_HOME='/local-worker/auth')
        else:
            qa_home=self.run/'validate-home'
            qa_home.mkdir(mode=0o700)
            mounts.append((qa_home,'/tmp/worker-home',False))
            env.update(RUNNER_TEMP='/tmp', AUDIT_TMPDIR='/qa-temp', TMPDIR='/qa-temp', FRESH_RUNNER='true', GITHUB_ACTIONS='true', DATABASE_URL_MASTER='postgresql://qa:synthetic-only@127.0.0.1:5432/postgres', DATABASE_URL_TENANT='postgresql://qa:synthetic-only@127.0.0.1:5432/postgres')
            # Install from the pristine base before the controller applies the generated patch.
            command = ['bash', '-c', 'mkdir -p "$HOME"; pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store >/tmp/install.log 2>&1 && pnpm --filter @gaespos/db prisma:generate >>/tmp/install.log 2>&1 && pnpm exec playwright install chromium >>/tmp/install.log 2>&1 && unset DATABASE_URL_TENANT && exec bash /controller/scripts/autonomous-incident-cycle-phase.sh']
        if name in ('executor', 'judge'):
            private_net = 'gaes-incident-net-' + str(uuid.uuid4())
            proxy = 'gaes-incident-proxy-' + str(uuid.uuid4())
            try:
                execute(['docker', 'network', 'create', '--internal', '--label', 'gaes.incident.local=true', private_net])
                execute(['docker', 'run', '-d', '--rm', '--name', proxy, '--label', 'gaes.incident.local=true', '--network', private_net,
                         '--network-alias', 'openai-proxy', '--user', f'{os.getuid()}:{os.getgid()}', '--cap-drop=ALL',
                         '--security-opt=no-new-privileges', '--read-only', '--pids-limit=64', '--memory=128m',
                         '--mount', f'type=bind,source={self.controller},target=/controller,readonly',
                         IMAGE, 'python3', '/controller/scripts/incident-egress-proxy.py'])
                execute(['docker', 'network', 'connect', 'bridge', proxy])
                env.update(HTTPS_PROXY='http://openai-proxy:3128', HTTP_PROXY='http://openai-proxy:3128', ALL_PROXY='http://openai-proxy:3128', NO_PROXY='')
                self.container(mounts, env, command, network=private_net, timeout=900)
            finally:
                cleanup(['docker', 'rm', '-f', proxy])
                cleanup(['docker', 'network', 'rm', private_net])
                shutil.rmtree(role_auth)
        else:
            media=self.load_helper('incident-media-sandbox')
            with media.bridge(self.run,self.scripts/'incident-media-sandbox.py') as media_mounts:
                self.container([*mounts,*media_mounts], env, command, network=network, timeout=2400)

    def publish(self, directory):
        home = self.run / 'publisher-home'
        home.mkdir(mode=0o700)
        env = clean_env(home)
        env.update(GH_TOKEN=private_file(self.credentials / 'github-token'), GITHUB_REPOSITORY=REPO,
                   INCIDENT_LOCAL_RUN_ID=self.run_id, ARTIFACT_DIR=str(self.artifacts),
                   INCIDENT_WORKER_FILE=str(self.artifacts / 'worker.json'), INCIDENT_FULL_RELEASE_AUDIT='true', AUTONOMY_PHASE='publish')
        execute(['bash', str(self.scripts / 'autonomous-incident-cycle-phase.sh')], cwd=directory, env=env, timeout=180)

    def load_helper(self, name):
        spec=importlib.util.spec_from_file_location(name.replace('-','_'),self.scripts/(name+'.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module

    def once(self):
        pending=self.load_helper('incident-pending-results')
        delivery=pending.replay_pending(self.state,self.scripts/'incident-worker-client.py',self.credentials/'incident-token')
        # Delivery retries block new claims below, but must never starve the
        # independent deterministic audit when the callback server is down.
        # Recover only resources belonging to this singleton after an abrupt stop.
        for kind in ('container', 'network'):
            ids=execute(['docker', kind, 'ls', '-q', '--filter', 'label=gaes.incident.local=true'],timeout=15).decode().split()
            for identifier in ids:
                if re.fullmatch('[a-f0-9]{12,64}',identifier):
                    command=['docker', kind, 'rm'] + (['-f'] if kind=='container' else []) + [identifier]
                    cleanup(command)
        execute(['docker', 'image', 'inspect', IMAGE], timeout=15)
        self.run = self.state / 'runs' / self.run_id
        self.run.mkdir(parents=True, mode=0o700)
        self.artifacts = self.run / 'artifacts'
        self.artifacts.mkdir(mode=0o700)
        checkpoint(self.state,'checking',phase='checkout',runId=self.run_id)
        executor, sha = self.clone('executor')
        audit=self.load_helper('incident-release-audit')
        checkpoint(self.state,'checking',phase='release_audit',runId=self.run_id)
        report=audit.run_audit(self,executor,sha)
        if report is not None:
            checkpoint(self.state,'audit_complete' if report['overall']=='passed' else 'audit_attention_required',phase='release_audit',runId=self.run_id)
            return
        if delivery['pending'] or delivery['blocked']:
            checkpoint(self.state,'publication_review_required' if delivery['blocked'] else 'report_pending',reason='publication_result_pending')
            return
        if (self.state/'publication-review.json').is_file():
            checkpoint(self.state,'publication_review_required',reason='publication_outcome_unknown')
            return
        quota = self.quota()
        if quota.get('status') != 'ready':
            checkpoint(self.state, 'waiting', **{k: quota[k] for k in ('reason', 'retryAt', 'remainingPercent') if k in quota})
            return
        self.transport('claim')
        if not (self.artifacts / 'worker.json').is_file():
            checkpoint(self.state, 'idle', remainingPercent=quota.get('remainingPercent'))
            return
        claimed = True
        publication_started = False
        publication_saved = False
        postgres = None
        try:
            worker = json.loads((self.artifacts / 'worker.json').read_text())
            checkpoint(self.state, 'working', phase='executor', runId=self.run_id, incidentId=worker['incidentId'])
            self.phase('executor', executor)
            validator, _ = self.clone('validate', sha)
            postgres = 'gaes-incident-qa-' + self.run_id
            execute(['docker', 'run', '-d', '--rm', '--name', postgres, '--label', 'gaes.incident.local=true',
                     '--memory=3g', '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,nodev,size=2g',
                     '--env', 'POSTGRES_USER=qa', '--env', 'POSTGRES_PASSWORD=synthetic-only', '--env', 'POSTGRES_DB=postgres', PG_IMAGE], timeout=120)
            for _ in range(30):
                try:
                    execute(['docker', 'exec', postgres, 'pg_isready', '-h', '127.0.0.1', '-U', 'qa', '-d', 'postgres'], timeout=5)
                    break
                except RuntimeError:
                    time.sleep(1)
            else:
                raise RuntimeError('QA unavailable')
            checkpoint(self.state, 'working', phase='validate', runId=self.run_id, incidentId=worker['incidentId'])
            self.phase('validate', validator, 'container:' + postgres)
            judge, _ = self.clone('judge', sha)
            checkpoint(self.state, 'working', phase='judge', runId=self.run_id, incidentId=worker['incidentId'])
            self.phase('judge', judge)
            publisher, _ = self.clone('publish', sha)
            publication_started = True
            self.publish(publisher)
            pending.save_pending(self.state,self.artifacts/'worker.json',self.artifacts/'result.json',self.run_id)
            publication_saved = True
            claimed = False  # A created PR must never become a generic 'failed' callback.
            receipt=pending.replay_pending(self.state,self.scripts/'incident-worker-client.py',self.credentials/'incident-token')
            if receipt['pending'] or receipt['blocked']:
                checkpoint(self.state,'publication_review_required' if receipt['blocked'] else 'report_pending',runId=self.run_id,reason='publication_result_pending')
                return
            result = json.loads((self.artifacts / 'result.json').read_text())
            checkpoint(self.state, 'review_required', runId=self.run_id, incidentId=worker['incidentId'], prUrl=result['prUrl'])
        except SubscriptionWait as waiting:
            checkpoint(self.state, 'waiting', **{k: waiting.quota[k] for k in ('reason', 'retryAt', 'remainingPercent') if k in waiting.quota}, runId=self.run_id)
        except Exception:
            if publication_saved:
                checkpoint(self.state,'report_pending',runId=self.run_id,reason='publication_result_pending')
                return
            if publication_started:
                marker={'version':1,'runId':self.run_id,'incidentId':worker['incidentId'],'claimId':worker['claimId'],'branch':'automation/incident-'+worker['claimId']}
                target=self.state/'publication-review.json'
                fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
                with os.fdopen(fd,'w') as stream:json.dump(marker,stream)
                checkpoint(self.state,'publication_review_required',runId=self.run_id,reason='publication_outcome_unknown')
                return
            if claimed:
                try:
                    self.transport('report')
                except Exception:
                    pass
            checkpoint(self.state, 'failed', reason='isolated_cycle_failed', runId=self.run_id)
        finally:
            if postgres:
                cleanup(['docker', 'rm', '-f', postgres])



def audit_progress(state, value):
    # An older completed report never describes a currently running commit.
    ident=value.get('runId','')
    if value.get('status')!='checking' or not isinstance(ident,str) or not re.fullmatch('[a-f0-9-]{36}',ident):
        return None
    path=state/'runs'/ident/'artifacts/release-audit.json'
    if not path.is_file() or any(p.is_symlink() for p in (path,*path.parents)) or path.stat().st_size>2_000_000:
        return {'overall':'preparing','releaseReady':False}
    report=json.loads(path.read_text())
    results=report.get('results',[])
    if not isinstance(results,list) or not all(isinstance(row,dict) for row in results):
        return {'overall':'unknown','releaseReady':False}
    return {'overall':report.get('overall','unknown'),'baseSha':report.get('baseSha'),
            'counts':{status:sum(row.get('status')==status for row in results) for status in ('passed','failed','blocked','notrun')},
            'releaseReady':False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['once', 'status'])
    parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args()
    state = args.state
    if not state.is_absolute() or state.is_symlink() or state.resolve() != state or any(p.is_symlink() for p in state.parents):
        raise RuntimeError('unsafe state directory')
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(state, 0o700)
    if args.command == 'status':
        value=json.loads((state/'status.json').read_text()) if (state/'status.json').is_file() else {'status':'not_started'}
        audit_path=state/'release-audit.json'
        if audit_path.is_file() and not audit_path.is_symlink() and audit_path.stat().st_size<=2_000_000:
            audit=json.loads(audit_path.read_text())
            value['releaseAudit']={key:audit.get(key) for key in ('overall','baseSha','finishedAt','counts','manualRequired','releaseReady')}
        else:
            value['releaseAudit']={'overall':'not_run','releaseReady':False}
        progress=audit_progress(state,value)
        if progress is not None: value['releaseAudit']['inProgress']=progress
        health=state/'health.json'
        value['health']=json.loads(health.read_text()).get('status','unknown') if health.is_file() and not health.is_symlink() else 'not_run'
        print(json.dumps(value))
        return
    def interrupt(_signal, _frame):
        raise InterruptedError('worker stopping')
    signal.signal(signal.SIGTERM, interrupt)
    with (state / 'worker.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        worker=Worker(state)
        try:
            worker.once()
        except Exception:
            checkpoint(state, 'waiting', reason='local_prerequisite_unavailable')
        finally:
            if worker.run and worker.run.is_dir():
                for child in worker.run.iterdir():
                    if child.is_dir() and child.name != 'artifacts' and not child.is_symlink():
                        shutil.rmtree(child)
                if worker.artifacts:
                    for name in ('patch','judge.txt'):
                        (worker.artifacts/name).unlink(missing_ok=True)
    # Remove old local workspaces; artifacts never contain credentials intentionally.
    runs = state / 'runs'
    if runs.is_dir():
        for p in runs.iterdir():
            if p.is_dir() and not p.is_symlink() and time.time() - p.stat().st_mtime > 3 * 86400:
                shutil.rmtree(p)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Local worker unavailable; private details withheld.', file=sys.stderr)
        sys.exit(1)
