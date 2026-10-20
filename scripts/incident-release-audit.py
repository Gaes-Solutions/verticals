#!/usr/bin/env python3
"""Trusted scheduling and durable evidence for audits that never use model quota."""
import hashlib
import json
import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


def stamp():
    return datetime.now(timezone.utc).isoformat()


def read_json(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 2_000_000:
        return None
    try:
        return json.loads(path.read_text())
    except (ValueError, OSError):
        return None


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
        raise ValueError('unsafe evidence path')
    temp=path.with_name(path.name+'.next')
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f: json.dump(value,f,indent=2)
    temp.replace(path)


def policy_digest(controller):
    digest=hashlib.sha256()
    for rel in ('scripts/release-audit.py','scripts/incident-media-sandbox.py','automation/release-audit-matrix.json'):
        digest.update((controller/rel).read_bytes())
    return digest.hexdigest()


def audit_due(state, sha, policy, current=None):
    prior=read_json(state/'release-audit.json')
    if not isinstance(prior,dict) or prior.get('baseSha')!=sha or prior.get('policyDigest')!=policy:
        return True
    try:
        age=(current or time.time())-datetime.fromisoformat(prior['finishedAt']).timestamp()
    except (ValueError,KeyError,TypeError):
        return True
    return age<0 or age >= (86400 if prior.get('overall')=='passed' else 3600)


def save_evidence(state, report, artifacts):
    report['releaseReady']=False  # Live-provider/device/manual gates are never auto-certified.
    write_json(state/'release-audit.json',report)
    write_json(state/'audit-history'/(report['runId']+'.json'),report)
    directory=state/'audit-findings'
    for check in report['results']:
        ident=check['checkId']
        if not isinstance(ident,str) or not ident or any(ch not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for ch in ident):
            raise ValueError('invalid evidence check identifier')
        target=directory/(ident+'.json')
        previous=read_json(target)
        if check['status']=='passed':
            if isinstance(previous,dict) and previous.get('resolvedAt') is None:
                previous.update(resolvedAt=report['finishedAt'],lastVerifiedSha=report['baseSha'])
                write_json(target,previous)
            continue
        value={'version':1,'checkId':ident,'firstSeen':previous.get('firstSeen') if isinstance(previous,dict) else report['finishedAt'],
               'lastSeen':report['finishedAt'],'occurrences':(previous.get('occurrences',0) if isinstance(previous,dict) else 0)+1,
               'resolvedAt':None,'baseSha':report['baseSha'],'runId':report['runId'],
               'status':check['status'],'reason':check.get('reason'),'logSha256':check.get('logSha256')}
        log=artifacts/'audit-logs'/(ident+'.log')
        if log.is_file() and not log.is_symlink() and log.stat().st_size<=50*1024*1024:
            keep=directory/'logs'/(ident+'.log');keep.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            if keep.is_symlink():raise ValueError('unsafe evidence log')
            shutil.copyfile(log,keep);os.chmod(keep,0o600)
        write_json(target,value)


def run_audit(worker, checkout, sha):
    policy=policy_digest(worker.controller)
    if not audit_due(worker.state,sha,policy):
        return None
    matrix=json.loads((worker.controller/'automation/release-audit-matrix.json').read_text())
    began=stamp()
    output=worker.artifacts/'release-audit.json'
    postgres='gaes-release-audit-'+worker.run_id
    install_home=worker.artifacts.parent/'audit-home'
    install_home.mkdir(mode=0o700)
    env={'HOME':'/tmp/audit-install-home','RUNNER_TEMP':'/tmp','CI':'true',
         'DATABASE_URL_MASTER':'postgresql://qa:synthetic-only@127.0.0.1:5432/postgres',
         'RELEASE_AUDIT_ISOLATED':'true','AUDIT_TMPDIR':'/qa-temp','TMPDIR':'/qa-temp',
         'DATABASE_URL_TENANT':'postgresql://qa:synthetic-only@127.0.0.1:5432/postgres'}
    # Fixed commands from a pristine checkout; no model, server token or personal HOME.
    command=['bash','-c', 'mkdir -p "$HOME"; pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store >/artifacts/setup.log 2>&1 && pnpm --filter @gaespos/db prisma:generate >>/artifacts/setup.log 2>&1 && pnpm exec playwright install chromium >>/artifacts/setup.log 2>&1 && exec python3 /controller/scripts/release-audit.py --repo /workspace --matrix /controller/automation/release-audit-matrix.json --output /artifacts/release-audit.json']
    failure=None
    try:
        worker_command(['docker','run','-d','--rm','--name',postgres,'--label','gaes.incident.local=true',
                        '--memory=3g','--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=2g',
                        '--env','POSTGRES_USER=qa','--env','POSTGRES_PASSWORD=synthetic-only','--env','POSTGRES_DB=postgres','postgres:16-alpine'],timeout=120)
        for _ in range(30):
            try:
                worker_command(['docker','exec',postgres,'pg_isready','-U','qa','-d','postgres'],timeout=5)
                break
            except Exception:
                time.sleep(1)
        else:
            raise RuntimeError('synthetic_database_unavailable')
        media=worker.load_helper('incident-media-sandbox')
        with media.bridge(worker.artifacts.parent,worker.controller/'scripts/incident-media-sandbox.py') as media_mounts:
            worker.container([(worker.controller,'/controller',True),(checkout,'/workspace',False),(worker.artifacts,'/artifacts',False),(install_home,'/tmp/audit-install-home',False),*media_mounts],env,command,
                             network='container:'+postgres,timeout=3900,accepted=(0,1))
    except subprocess.TimeoutExpired:
        failure='audit_budget_exhausted'
    except Exception:
        failure='audit_environment_unavailable'
    finally:
        try:worker_command(['docker','rm','-f',postgres],timeout=30)
        except Exception:pass
    report=read_json(output)
    expected={row['id'] for row in matrix['checks']}
    if not isinstance(report,dict) or report.get('baseSha')!=sha or not isinstance(report.get('results'),list):
        report={'version':1,'baseSha':sha,'startedAt':began,'results':[],'manualRequired':matrix['manualRequired']}
        failure=failure or 'audit_report_missing'
    if report.get('controllerMatrixSha256') != hashlib.sha256((worker.controller/'automation/release-audit-matrix.json').read_bytes()).hexdigest():
        failure=failure or 'audit_policy_mismatch'
    report['reason']=failure
    candidates=report['results']
    seen=set()
    invalid=False
    import re
    for row in candidates:
        if not isinstance(row,dict) or row.get('checkId') not in expected or row.get('checkId') in seen:
            invalid=True;break
        seen.add(row['checkId'])
        if row.get('status') in ('notrun','not_run'):
            row.update(status='blocked',reason='check_not_executed',durationMs=0,exitCode=None,logSha256=None)
        if row.get('status') not in ('passed','failed','blocked') or (row.get('status')=='passed' and row.get('exitCode')!=0):
            invalid=True;break
        if not isinstance(row.get('durationMs'),int) or row['durationMs']<0 or (row.get('logSha256') is None and row['status']!='blocked') or (row.get('logSha256') is not None and (not isinstance(row['logSha256'],str) or not re.fullmatch('[a-f0-9]{64}',row['logSha256']))):
            invalid=True;break
    if invalid:
        failure='invalid_audit_evidence'
        candidates=[]
    results={row['checkId']:row for row in candidates}
    report['manualRequired']=matrix['manualRequired']
    report['reason']=failure
    for ident in expected-results.keys():
        results[ident]={'checkId':ident,'status':'blocked','durationMs':0,'exitCode':None,'logSha256':None,'reason':failure or 'check_not_executed'}
    report['results']=[results[row['id']] for row in matrix['checks']]
    report.update(runId=worker.run_id,policyDigest=policy,finishedAt=stamp())
    if failure or any(row['status']=='blocked' for row in report['results']):report['overall']='incomplete'
    elif all(row['status']=='passed' for row in report['results']):report['overall']='passed'
    else:report['overall']='failed'
    report['counts']={status:sum(row['status']==status for row in report['results']) for status in ('passed','failed','blocked')}
    save_evidence(worker.state,report,worker.artifacts)
    return report


def worker_command(args,timeout=60):
    result=subprocess.run(args,env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/tmp'},capture_output=True,timeout=timeout)
    if result.returncode:raise RuntimeError('audit_environment_command_failed')
    return result.stdout
