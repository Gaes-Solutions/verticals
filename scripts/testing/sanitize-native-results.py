"""Remove ephemeral fixture credentials and bearer tokens from publishable text."""
import os
from pathlib import Path
import re

root = Path(os.environ['RUNNER_TEMP']) / 'native/results'
secrets = [os.environ.get(name, '') for name in ('MAESTRO_QA_EMAIL', 'MAESTRO_QA_PASSWORD')]
for file in root.glob('*'):
    if file.suffix not in {'.log', '.xml', '.json'}:
        continue
    text = file.read_text(errors='replace')
    for secret in secrets:
        if secret:
            text = text.replace(secret, '[REDACTED]')
    text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_TOKEN]', text)
    file.write_text(text)
print('Sanitized publishable native text evidence')
