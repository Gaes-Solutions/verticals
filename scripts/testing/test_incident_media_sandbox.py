#!/usr/bin/env python3
"""Adversarial contract tests; no network, media tools, Docker or provider calls."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('mediabridge',Path(__file__).resolve().parents[1]/'incident-media-sandbox.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class MediaBridge(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);(self.root/'fixture').write_bytes(b'synthetic')
    def args(self,tool='ffprobe'):
        return [*m.PREFIX,'/qa-temp/fixture','/input','--ro-bind','/usr/bin/'+tool,'/tool','--','/tool',*(m.PROBE if tool=='ffprobe' else m.DECODE)]
    def test_only_two_exact_fixed_decoder_commands_are_accepted(self):
        for tool in ('ffprobe','ffmpeg'):
            relative,name,_=m.parse_request(self.args(tool));self.assertEqual(relative,Path('fixture'));self.assertEqual(name,tool)
    def test_host_paths_traversal_input_root_and_arbitrary_tools_are_rejected(self):
        for path in ('/etc/passwd','/qa-temp/../etc/passwd','/qa-temp','relative','/qa-temp-other/file'):
            args=self.args();args[len(m.PREFIX)]=path
            with self.subTest(path=path),self.assertRaises(ValueError):m.parse_request(args)
        args=self.args();args[len(m.PREFIX)+3]='/bin/sh'
        with self.assertRaises(ValueError):m.parse_request(args)
    def test_extra_mounts_network_protocols_and_arbitrary_flags_are_rejected(self):
        mutations=[self.args()+['-i','https://example.invalid'],self.args()[:-1]+['/etc/passwd'],['--share-net',*self.args()],self.args()+['--ro-bind','/','/host']]
        for args in mutations:
            with self.subTest(args=args[-2:]),self.assertRaises(ValueError):m.parse_request(args)
    def test_invalid_json_shapes_are_not_a_command_language(self):
        for args in (None,{},'sh',[],[1],self.args()+[None]):
            with self.assertRaises(ValueError):m.parse_request(args)
    def test_input_fd_is_regular_readonly_and_pinned_after_rename(self):
        fd=m.input_fd(self.root,Path('fixture'))
        try:
            (self.root/'fixture').rename(self.root/'renamed');(self.root/'fixture').write_bytes(b'replacement')
            self.assertEqual(os.read(fd,100),b'synthetic')
            with self.assertRaises(OSError):os.write(fd,b'forbidden')
        finally:os.close(fd)
    def test_file_and_ancestor_symlinks_are_refused(self):
        (self.root/'link').symlink_to(self.root/'fixture');(self.root/'directory').symlink_to(self.root,target_is_directory=True)
        for path in ('link','directory/fixture'):
            with self.assertRaises(OSError):m.input_fd(self.root,Path(path))
    def test_fifo_directory_empty_and_nonrelative_inputs_are_refused(self):
        os.mkfifo(self.root/'fifo');(self.root/'empty').touch();(self.root/'directory').mkdir()
        for path in ('fifo','empty','directory'):
            with self.assertRaises(ValueError):m.input_fd(self.root,Path(path))
        for path in ('../fixture','/etc/passwd','.'):
            with self.assertRaises(ValueError):m.input_fd(self.root,Path(path))
    def test_host_decoder_runs_under_real_bwrap_with_bounded_resources_and_no_home(self):
        def execute(args,**kwargs):
            self.assertEqual(args[:2],['/usr/bin/prlimit','--as=805306368']);self.assertIn('--cpu=30',args);self.assertIn('--fsize=262144',args)
            self.assertIn('/usr/bin/bwrap',args);self.assertIn('--unshare-all',args)
            self.assertTrue(any(value.startswith('/proc/self/fd/') for value in args))
            self.assertEqual(kwargs['env'],{'PATH':'/usr/bin:/bin'});self.assertEqual(kwargs['timeout'],35)
            kwargs['stdout'].write(b'{"streams":[]}');return types.SimpleNamespace(returncode=0)
        with patch.object(m,'host_tool',return_value=Path('/usr/bin/ffprobe')),patch.object(m.subprocess,'run',side_effect=execute):
            result=m.decode(self.root,self.args())
        self.assertEqual(result['exitCode'],0)
    def test_output_limit_fails_closed(self):
        def execute(args,**kwargs):kwargs['stdout'].write(b'x'*(m.MAX_OUTPUT+1));return types.SimpleNamespace(returncode=0)
        with patch.object(m,'host_tool',return_value=Path('/usr/bin/ffprobe')),patch.object(m.subprocess,'run',side_effect=execute),self.assertRaises(ValueError):m.decode(self.root,self.args())
    def test_timeout_closes_pinned_input_descriptor(self):
        before=len(list(Path('/proc/self/fd').iterdir()))
        with patch.object(m,'host_tool',return_value=Path('/usr/bin/ffprobe')),patch.object(m.subprocess,'run',side_effect=subprocess.TimeoutExpired('synthetic',35)),self.assertRaises(subprocess.TimeoutExpired):m.decode(self.root,self.args())
        self.assertEqual(len(list(Path('/proc/self/fd').iterdir())),before)
    def test_bridge_is_private_readonly_to_qa_and_terminates_after_context(self):
        run=self.root/'run';run.mkdir();script=self.root/'trusted.py';script.write_text('trusted fixture')
        from unittest.mock import Mock
        process=Mock();process.poll.side_effect=[None,None];process.wait.return_value=0
        with patch.object(m.subprocess,'Popen',return_value=process) as spawn,patch.object(Path,'is_socket',return_value=True):
            with m.bridge(run,script) as mounts:
                self.assertEqual((run/'qa-media').stat().st_mode&0o777,0o700)
                self.assertEqual((run/'qa-media/client').stat().st_mode&0o777,0o700)
                self.assertIn((run/'qa-media','/qa-media',True),mounts)
                self.assertIn((run/'qa-media/client','/usr/bin/bwrap',True),mounts)
                self.assertEqual(spawn.call_args.args[0][:2],['/usr/bin/setpriv','--no-new-privs'])
        process.terminate.assert_called_once();process.wait.assert_called_once()

    def test_rejected_request_never_starts_host_command(self):
        with patch.object(m.subprocess,'run') as run,self.assertRaises(ValueError):m.decode(self.root,['sh','-c','forbidden'])
        run.assert_not_called()

if __name__=='__main__':unittest.main()
