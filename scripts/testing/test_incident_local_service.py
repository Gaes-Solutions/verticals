"""User service installer tests: temporary HOME and mocked D-Bus, no real units."""
import importlib.util
import io
import json
from contextlib import redirect_stdout
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
        self.assertIn(f'WorkingDirectory={self.state / "controller"}\n', service)
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


class HealthInstallerTests(unittest.TestCase):
    def setUp(self):
        InstallerTests.setUp(self)
        self.health_script = self.state / 'controller/scripts/incident-health.py'
        self.health_script.write_text('# synthetic health monitor; never executed\n')
        self.health_script.chmod(0o600)

    def install_health(self):
        return installer.install_health(self.state, self.home, self.bus)

    def test_installs_only_separate_health_units_and_starts_one_independent_check(self):
        result = self.install_health()
        self.assertTrue(result['scheduled'])
        self.assertEqual(result['component'], 'health')
        self.assertEqual(result['timer']['name'], installer.HEALTH_TIMER)
        self.assertEqual(result['service']['name'], installer.HEALTH_SERVICE)
        units = self.home / '.config/systemd/user'
        self.assertEqual({path.name for path in units.iterdir()}, {installer.HEALTH_SERVICE, installer.HEALTH_TIMER})
        service = (units / installer.HEALTH_SERVICE).read_text()
        timer = (units / installer.HEALTH_TIMER).read_text()
        self.assertIn(f'WorkingDirectory={self.state / "controller"}\n', service)
        self.assertIn(f'ExecStart=/usr/bin/python3 "{self.health_script}" --state "{self.state}"', service)
        for item in ['Type=oneshot', 'UMask=0077', 'NoNewPrivileges=true', 'TimeoutStartSec=90s']:
            self.assertIn(item, service)
        self.assertIn('OnUnitInactiveSec=10min', timer)
        self.assertIn(f'Unit={installer.HEALTH_SERVICE}', timer)
        self.assertNotIn('incident-local-worker', service)
        self.assertNotIn('Environment=', service)
        calls = [args for args, _ in self.bus.calls if args[3] == 'call']
        self.assertEqual([args[7] for args in calls[:4]], ['Reload', 'EnableUnitFiles', 'StartUnit', 'StartUnit'])
        self.assertEqual(calls[1][8:], ['asbb', '1', installer.HEALTH_TIMER, 'false', 'true'])
        self.assertEqual(calls[2][8:], ['ss', installer.HEALTH_TIMER, 'replace'])
        self.assertEqual(calls[3][8:], ['ss', installer.HEALTH_SERVICE, 'replace'])
        self.assertTrue(all(installer.SERVICE not in args and installer.TIMER not in args for args, _ in self.bus.calls))
        for path in units.iterdir():
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_existing_worker_units_are_byte_identical_and_never_started_by_health_install(self):
        installer.install(self.state, self.home, self.bus)
        units = self.home / '.config/systemd/user'
        before = {name: (units / name).read_bytes() for name in (installer.SERVICE, installer.TIMER)}
        self.bus.calls.clear()
        self.install_health()
        for name, body in before.items():
            self.assertEqual((units / name).read_bytes(), body)
        self.assertTrue(all(installer.SERVICE not in args and installer.TIMER not in args for args, _ in self.bus.calls))

    def test_health_status_is_typed_readonly_and_uses_only_health_unit_names(self):
        self.bus.missing = {installer.HEALTH_SERVICE, installer.HEALTH_TIMER}
        result = installer.health_status(self.state, self.home, self.bus)
        self.assertFalse(result['scheduled'])
        self.assertTrue(result['controllerReady'])
        self.assertEqual(result['timer'], {'name': installer.HEALTH_TIMER, 'loaded': False})
        self.assertEqual(result['service'], {'name': installer.HEALTH_SERVICE, 'loaded': False})
        self.assertFalse((self.home / '.config').exists())
        self.assertTrue(all(args[7] == 'GetUnit' for args, _ in self.bus.calls))
        self.bus.missing.clear()
        self.bus.bad_property = 'i 1'
        with self.assertRaises(ValueError):
            installer.health_status(self.state, self.home, self.bus)

    def test_missing_or_symlink_health_script_fails_before_touching_units(self):
        self.health_script.unlink()
        with self.assertRaises(ValueError):
            self.install_health()
        self.health_script.symlink_to(self.script)
        with self.assertRaises(ValueError):
            self.install_health()
        self.assertFalse(self.bus.calls)
        self.assertFalse((self.home / '.config').exists())

    def test_health_install_refuses_unmanaged_health_units(self):
        units = self.home / '.config/systemd/user'
        units.mkdir(parents=True)
        target = units / installer.HEALTH_SERVICE
        target.write_text('[Service]\nExecStart=/bin/other\n')
        target.chmod(0o600)
        with self.assertRaises(ValueError):
            self.install_health()
        self.assertEqual(target.read_text(), '[Service]\nExecStart=/bin/other\n')
        self.assertFalse(self.bus.calls)

    def test_new_cli_flags_do_not_select_legacy_worker_actions(self):
        for flag, selected in [('--install-health', 'install_health'), ('--health-status', 'health_status')]:
            output = io.StringIO()
            with self.subTest(flag=flag), \
                 patch.object(installer, selected, return_value={'component': 'health', 'scheduled': True}) as action, \
                 patch.object(installer, 'install') as old_install, patch.object(installer, 'status') as old_status, \
                 redirect_stdout(output):
                self.assertEqual(installer.main(['--state', str(self.state), flag]), 0)
                action.assert_called_once_with(str(self.state))
                old_install.assert_not_called()
                old_status.assert_not_called()
            self.assertEqual(json.loads(output.getvalue())['component'], 'health')


class RealUnitSyntax(unittest.TestCase):
    def test_working_directory_is_literal_absolute_path_not_shell_quoted(self):
        definitions=installer.definitions(Path('/home/test/.local/share/worker'))
        service=definitions[installer.SERVICE]
        self.assertIn('WorkingDirectory=/home/test/.local/share/worker/controller\n',service)
        self.assertNotIn('WorkingDirectory="',service)

if __name__ == '__main__':
    unittest.main()
