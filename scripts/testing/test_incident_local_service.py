"""User service installer tests: temporary HOME and mocked D-Bus, no real units."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'install-incident-local-service.py'
spec = importlib.util.spec_from_file_location('incident_local_service', SOURCE)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class FakeBus:
    def __init__(self):
        self.calls = []
        self.timer_active = True
        self.missing = set()
        self.bad_property = None

    def __call__(self, args, **kwargs):
        self.calls.append((args, kwargs))
        if args[3] == 'call':
            if args[7] == 'GetUnit':
                unit = args[9]
                if unit in self.missing:
                    raise subprocess.CalledProcessError(1, args, stderr='No unit')
                name = 'timer' if unit.endswith('.timer') else 'service'
                output = f'o "/org/freedesktop/systemd1/unit/gaes_{name}"'
            else:
                output = ''
        else:
            prop = args[7]
            timer = args[5].endswith('_timer')
            values = {'ActiveState': 's "active"' if timer and self.timer_active else 's "inactive"',
                      'SubState': 's "waiting"' if timer and self.timer_active else 's "dead"',
                      'Result': 's "success"', 'ExecMainStatus': 'i 0'}
            output = self.bad_property or values[prop]
        return types.SimpleNamespace(stdout=output, returncode=0)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='gaes-service-test-')
        self.addCleanup(self.directory.cleanup)
        self.home = Path(self.directory.name)
        self.state = self.home / '.local/share/gaes-incident-local'
        self.script = self.state / 'controller/scripts/incident-local-worker.py'
        self.script.parent.mkdir(mode=0o700, parents=True)
        for parent in (self.script.parent, *self.script.parent.parents):
            if parent == self.home.parent:
                break
            parent.chmod(0o700)
        self.script.write_text('# synthetic controller; never executed\n')
        self.script.chmod(0o600)
        self.bus = FakeBus()

    def install(self):
        return installer.install(self.state, self.home, self.bus)

    def test_install_writes_hardened_units_and_uses_only_standard_user_bus_api(self):
        with patch.dict(os.environ, {'DATABASE_URL_MASTER': 'private', 'OPENAI_API_KEY': 'private', 'GH_TOKEN': 'private'}):
            result = self.install()
        self.assertTrue(result['scheduled'])
        units = self.home / '.config/systemd/user'
        service = (units / installer.SERVICE).read_text()
        timer = (units / installer.TIMER).read_text()
        self.assertIn(f'ExecStart=/usr/bin/python3 "{self.script}" once --state "{self.state}"', service)
        self.assertIn(f'WorkingDirectory="{self.state / "controller"}"', service)
        for setting in ['Type=oneshot', 'UMask=0077', 'NoNewPrivileges=true', 'PrivateTmp=false', 'TimeoutStartSec=75min']:
            self.assertIn(setting, service)
        for setting in ['OnBootSec=2min', 'OnUnitInactiveSec=10min', 'Persistent=true', f'Unit={installer.SERVICE}', 'WantedBy=timers.target']:
            self.assertIn(setting, timer)
        self.assertNotIn('Environment=', service)
        self.assertNotIn('docker.sock', service)
        self.assertEqual(stat.S_IMODE((units / installer.SERVICE).stat().st_mode), 0o600)
        calls = [args for args, _ in self.bus.calls if args[3] == 'call']
        self.assertEqual([args[7] for args in calls[:3]], ['Reload', 'EnableUnitFiles', 'StartUnit'])
        self.assertEqual(calls[1][8:], ['asbb', '1', installer.TIMER, 'false', 'true'])
        self.assertEqual(calls[2][8:], ['ss', installer.TIMER, 'replace'])
        for args, kwargs in self.bus.calls:
            self.assertEqual(args[:3], ['/usr/bin/busctl', '--user', '--no-pager'])
            self.assertEqual(set(kwargs['env']), {'PATH', 'HOME', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'})
            self.assertEqual(kwargs['timeout'], 15)
            self.assertTrue(kwargs['check'])
        self.assertEqual(result['service']['exitStatus'], 0)

    def test_reinstallation_replaces_managed_units_atomically_without_temporary_files(self):
        self.install()
        self.install()
        units = self.home / '.config/systemd/user'
        self.assertEqual({p.name for p in units.iterdir()}, {installer.SERVICE, installer.TIMER})

    def test_status_is_readonly_and_reports_missing_or_inactive_units(self):
        self.bus.missing = {installer.SERVICE, installer.TIMER}
        result = installer.status(self.state, self.home, self.bus)
        self.assertFalse(result['scheduled'])
        self.assertEqual(result['timer'], {'loaded': False})
        self.assertFalse((self.home / '.config').exists())
        self.assertTrue(all(args[7] == 'GetUnit' for args, _ in self.bus.calls))
        self.bus.missing.clear()
        self.bus.timer_active = False
        self.assertFalse(installer.status(self.state, self.home, self.bus)['scheduled'])

    def test_status_rejects_untyped_or_injected_bus_properties(self):
        for value in ['i 1', 's "active" trailing', 's "active; touch /tmp/pwn"']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.bus.bad_property = value
                installer.status(self.state, self.home, self.bus)

    def test_missing_controller_or_nonprivate_state_is_refused_before_units_or_bus_calls(self):
        self.script.unlink()
        with self.assertRaises(ValueError):
            self.install()
        self.assertFalse(self.bus.calls)
        self.assertFalse((self.home / '.config').exists())
        self.script.write_text('# synthetic\n')
        self.script.chmod(0o600)
        self.state.chmod(0o755)
        with self.assertRaises(ValueError):
            self.install()
        self.assertFalse(self.bus.calls)

    def test_symlink_controller_units_or_state_are_refused(self):
        target = self.home / 'target.py'
        target.write_text('# synthetic\n')
        self.script.unlink()
        self.script.symlink_to(target)
        with self.assertRaises(ValueError):
            self.install()
        self.script.unlink()
        self.script.write_text('# synthetic\n')
        self.script.chmod(0o600)
        units = self.home / '.config/systemd/user'
        units.mkdir(parents=True)
        (units / installer.SERVICE).symlink_to(target)
        with self.assertRaises(ValueError):
            self.install()
        self.assertEqual(target.read_text(), '# synthetic\n')
        link = self.home / 'state-link'
        link.symlink_to(self.state, target_is_directory=True)
        with self.assertRaises(ValueError):
            installer.install(link, self.home, self.bus)
        self.assertFalse(self.bus.calls)

    def test_unmanaged_units_and_writable_controller_are_refused(self):
        units = self.home / '.config/systemd/user'
        units.mkdir(parents=True)
        path = units / installer.SERVICE
        path.write_text('[Service]\nExecStart=/bin/other\n')
        path.chmod(0o600)
        with self.assertRaises(ValueError):
            self.install()
        self.assertEqual(path.read_text(), '[Service]\nExecStart=/bin/other\n')
        path.unlink()
        self.script.chmod(0o666)
        with self.assertRaises(ValueError):
            self.install()
        self.assertFalse(self.bus.calls)

    def test_relative_outside_home_traversal_and_environment_expansion_paths_are_refused(self):
        for path in ['relative', '/tmp/not-home', self.home / '..' / 'escape', self.home / '$TOKEN', self.home / 'bad\nline']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                installer.status(path, self.home, self.bus)
        self.assertFalse(self.bus.calls)

    def test_systemd_specifiers_quotes_and_backslashes_are_escaped_without_shell(self):
        quoted = installer.quote(self.home / '100% "quoted" \\ path')
        self.assertIn('100%%', quoted)
        self.assertIn('\\"quoted\\"', quoted)
        self.assertIn('\\\\ path', quoted)
        service = installer.definitions(self.state)[installer.SERVICE]
        self.assertNotIn('/bin/sh', service)


if __name__ == '__main__':
    unittest.main()
