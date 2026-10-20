#!/usr/bin/env python3
"""Install the credential-free user timer through the standard systemd D-Bus API."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile

SERVICE = 'gaes-incident-local.service'
TIMER = 'gaes-incident-local.timer'
MANAGER = '/org/freedesktop/systemd1'
DESTINATION = 'org.freedesktop.systemd1'
MANAGED = '# Managed by Gaes incident local worker installer.\n'


def safe_path(value, home):
    path, home = Path(value), Path(home)
    if not path.is_absolute() or not home.is_absolute() or path == home or '..' in path.parts:
        raise ValueError('path must remain inside the user home')
    try:
        path.relative_to(home)
    except ValueError:
        raise ValueError('path must remain inside the user home') from None
    if '$' in str(path) or any(ord(c) < 32 or ord(c) == 127 for c in str(path)):
        raise ValueError('invalid path characters')
    for parent in (path, *path.parents):
        if parent == home.parent:
            break
        if parent.is_symlink():
            raise ValueError('symlink path refused')
        if parent.exists():
            info = parent.stat()
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise ValueError('path ownership or permissions are unsafe')
    return path


def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


def definitions(state):
    controller = state / 'controller'
    script = controller / 'scripts' / 'incident-local-worker.py'
    service = MANAGED + f'''[Unit]
Description=Gaes isolated incident worker cycle

[Service]
Type=oneshot
WorkingDirectory={quote(controller)}
ExecStart=/usr/bin/python3 {quote(script)} once --state {quote(state)}
UMask=0077
NoNewPrivileges=true
PrivateTmp=false
TimeoutStartSec=75min
StandardOutput=journal
StandardError=journal
'''
    timer = MANAGED + f'''[Unit]
Description=Run the Gaes incident worker after each completed cycle

[Timer]
OnBootSec=2min
OnUnitInactiveSec=10min
Persistent=true
Unit={SERVICE}

[Install]
WantedBy=timers.target
'''
    return {SERVICE: service, TIMER: timer}


class UserBus:
    def __init__(self, home, runner=None):
        self.runner = runner or subprocess.run
        uid = os.getuid()
        self.env = {'PATH': '/usr/bin:/bin', 'HOME': str(home),
                    'XDG_RUNTIME_DIR': f'/run/user/{uid}',
                    'DBUS_SESSION_BUS_ADDRESS': f'unix:path=/run/user/{uid}/bus'}

    def run(self, args):
        result = self.runner(['/usr/bin/busctl', '--user', '--no-pager', *args],
                             env=self.env, check=True, capture_output=True,
                             text=True, timeout=15)
        if len(result.stdout) > 65536:
            raise ValueError('oversized D-Bus response')
        return result.stdout.strip()

    def call(self, method, *args):
        return self.run(['call', DESTINATION, MANAGER, DESTINATION + '.Manager', method, *args])

    def property(self, unit_path, interface, name, signature):
        value = shlex.split(self.run(['get-property', DESTINATION, unit_path, interface, name]))
        if len(value) != 2 or value[0] != signature:
            raise ValueError('invalid D-Bus property type')
        if signature == 's':
            if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', value[1]):
                raise ValueError('invalid D-Bus state')
            return value[1]
        if signature == 'i' and re.fullmatch(r'-?[0-9]+', value[1]):
            return int(value[1])
        raise ValueError('invalid D-Bus property value')

    def unit_path(self, name):
        value = shlex.split(self.call('GetUnit', 's', name))
        if len(value) != 2 or value[0] != 'o' or not re.fullmatch(r'/org/freedesktop/systemd1/unit/[A-Za-z0-9_]+', value[1]):
            raise ValueError('invalid D-Bus object path')
        return value[1]


def status(state, home=None, runner=None):
    home = Path(home or Path.home())
    state = safe_path(state, home)
    bus = UserBus(home, runner)
    result = {'state': str(state), 'controllerReady': (state / 'controller/scripts/incident-local-worker.py').is_file(), 'timer': {}, 'service': {}}
    for name, key in [(TIMER, 'timer'), (SERVICE, 'service')]:
        try:
            unit_path = bus.unit_path(name)
        except subprocess.CalledProcessError:
            result[key] = {'loaded': False}
            continue
        result[key] = {'loaded': True,
                       'activeState': bus.property(unit_path, DESTINATION + '.Unit', 'ActiveState', 's'),
                       'subState': bus.property(unit_path, DESTINATION + '.Unit', 'SubState', 's')}
        if key == 'service':
            result[key]['result'] = bus.property(unit_path, DESTINATION + '.Service', 'Result', 's')
            result[key]['exitStatus'] = bus.property(unit_path, DESTINATION + '.Service', 'ExecMainStatus', 'i')
    result['scheduled'] = result['timer'].get('activeState') == 'active' and result['timer'].get('subState') in ('waiting', 'running', 'elapsed')
    return result


def make_private_directories(path):
    missing = []
    current = path
    while not current.exists():
        missing.append(current)
        current = current.parent
    for directory in reversed(missing):
        directory.mkdir(mode=0o700)


def write_unit(path, text):
    if path.exists():
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or not path.read_text().startswith(MANAGED):
            raise ValueError('existing unmanaged unit refused')
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def install(state, home=None, runner=None):
    home = Path(home or Path.home())
    state = safe_path(state, home)
    if not state.is_dir() or state.stat().st_mode & 0o077:
        raise ValueError('state directory must be private')
    script = safe_path(state / 'controller/scripts/incident-local-worker.py', home)
    if not script.is_file():
        raise ValueError('trusted controller script is missing')
    directory = safe_path(home / '.config/systemd/user', home)
    make_private_directories(directory)
    safe_path(directory, home)
    for name, text in definitions(state).items():
        unit = safe_path(directory / name, home)
        write_unit(unit, text)
    bus = UserBus(home, runner)
    bus.call('Reload')
    bus.call('EnableUnitFiles', 'asbb', '1', TIMER, 'false', 'true')
    bus.call('StartUnit', 'ss', TIMER, 'replace')
    return status(state, home, runner)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', required=True)
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--install', action='store_true')
    action.add_argument('--status', action='store_true')
    args = parser.parse_args(argv)
    result = status(args.state) if args.status else install(args.state)
    print(json.dumps(result, sort_keys=True, ensure_ascii=False))
    return 0 if args.status or result['scheduled'] else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('Local incident service setup failed; credentials and command details withheld.', file=sys.stderr)
        sys.exit(1)
