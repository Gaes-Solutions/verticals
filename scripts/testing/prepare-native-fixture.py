"""Create per-run synthetic credentials on the disposable runner, never in Git."""
import os
from pathlib import Path
import secrets

run = os.environ['GITHUB_RUN_ID']
attempt = os.environ['GITHUB_RUN_ATTEMPT']
assert run.isdigit() and attempt.isdigit(), 'Only a GitHub Actions run is supported'
email = f'qa-native-{run}-{attempt}@example.invalid'
password = secrets.token_urlsafe(24)
for value in (email, password):
    print(f'::add-mask::{value}')
with Path(os.environ['GITHUB_ENV']).open('a') as output:
    output.write(f'MAESTRO_QA_EMAIL={email}\nMAESTRO_QA_PASSWORD={password}\n')
print('Prepared isolated staging-only shopper fixture; no account created yet')
