#!/usr/bin/python3
"""Restricted QA decoder bridge. Never executes repository code on the host."""
import argparse
from contextlib import contextmanager
import base64
import json
import os
from pathlib import Path
import socket
import socketserver
import stat
import struct
import subprocess
import sys
import tempfile
import time

PREFIX=['--unshare-all','--die-with-parent','--new-session','--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--ro-bind','/etc/alternatives','/etc/alternatives','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind']
PROBE=['-v','error','-max_alloc','268435456','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json','/input']
DECODE=['-v','error','-xerror','-nostdin','-threads','1','-max_alloc','268435456','-protocol_whitelist','file,pipe','-i','/input','-threads','1','-f','null','-']
MAX_REQUEST=16384
MAX_OUTPUT=256*1024


def parse_request(args):
    if not isinstance(args,list) or not all(isinstance(a,str) for a in args) or args[:len(PREFIX)]!=PREFIX:
        raise ValueError('unsupported decoder contract')
    tail=args[len(PREFIX):]
    if len(tail)<7 or tail[1:3]!=['/input','--ro-bind'] or tail[4:7]!=['/tool','--','/tool']:
        raise ValueError('unsupported decoder binding')
    tool=tail[3]
    expected=PROBE if tool=='/usr/bin/ffprobe' else DECODE if tool=='/usr/bin/ffmpeg' else None
    if expected is None or tail[7:]!=expected:
        raise ValueError('only fixed decoder commands are accepted')
    path=Path(tail[0])
    if not path.is_absolute() or '..' in path.parts or not path.is_relative_to('/qa-temp') or path==Path('/qa-temp'):
        raise ValueError('input must remain in synthetic QA storage')
    return path.relative_to('/qa-temp'),Path(tool).name,expected


def input_fd(root,relative):
    # Pin every directory and the regular file; symlink/rename races cannot read HOME.
    if relative.is_absolute() or '..' in relative.parts or not relative.parts:
        raise ValueError('invalid relative media path')
    directory=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for part in relative.parts[:-1]:
            following=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
            os.close(directory);directory=following
        fd=os.open(relative.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
    finally:
        os.close(directory)
    info=os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or not 0<info.st_size<=100*1024*1024:
        os.close(fd);raise ValueError('invalid synthetic media input')
    return fd


def host_tool(name):
    for path in (Path('/usr/bin')/name,Path.home()/'.local/ffmpeg'/name):
        if not path.is_file() or path.is_symlink():continue
        info=path.stat()
        if info.st_uid not in (0,os.getuid()) or info.st_mode&0o022 or not os.access(path,os.X_OK):continue
        return path
    raise ValueError('trusted host decoder unavailable')


def decode(root,args):
    relative,name,command=parse_request(args)
    tool=host_tool(name)
    fd=input_fd(root,relative)
    try:
        argv=['/usr/bin/prlimit','--as=805306368','--cpu=30','--nofile=64','--fsize=262144','--','/usr/bin/bwrap',*PREFIX,
              f'/proc/self/fd/{fd}','/input','--ro-bind',str(tool),'/tool','--','/tool',*command]
        with tempfile.TemporaryFile(dir=root) as output,tempfile.TemporaryFile(dir=root) as errors:
            result=subprocess.run(argv,pass_fds=(fd,),stdin=subprocess.DEVNULL,stdout=output,stderr=errors,
                                  env={'PATH':'/usr/bin:/bin'},timeout=35)
            output.seek(0);errors.seek(0);stdout=output.read(MAX_OUTPUT+1);stderr=errors.read(MAX_OUTPUT+1)
        if len(stdout)+len(stderr)>MAX_OUTPUT:raise ValueError('decoder output exceeded limit')
        return {'exitCode':result.returncode,'stdout':base64.b64encode(stdout).decode(),'stderr':base64.b64encode(stderr).decode()}
    finally:os.close(fd)


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(40)
        try:
            _,uid,_=struct.unpack('3i',self.connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
            if uid!=os.getuid():raise ValueError('invalid peer')
            raw=self.rfile.readline(MAX_REQUEST+1)
            if len(raw)>MAX_REQUEST or not raw.endswith(b'\n'):raise ValueError('invalid request size')
            request=json.loads(raw)
            if not isinstance(request,dict) or set(request)!={'args'}:raise ValueError('invalid request')
            response=decode(self.server.media_root,request['args'])
        except Exception:
            response={'exitCode':1,'stdout':'','stderr':base64.b64encode(b'Isolated decoder request rejected\n').decode()}
        self.wfile.write(json.dumps(response).encode()+b'\n')


def serve(path,root):
    if path.exists() or path.is_symlink() or not root.is_dir() or root.is_symlink():raise ValueError('unsafe bridge paths')
    # Serial requests bound host CPU and memory; there is no generic shell/RPC.
    directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        # Linux AF_UNIX limits address length to 107 bytes. Bind through a pinned
        # directory FD; the private socket inode remains in the long run path.
        with socketserver.UnixStreamServer(f'/proc/self/fd/{directory}/{path.name}',Handler) as server:
            os.chmod(path,0o600);server.media_root=root
            server.serve_forever(poll_interval=0.2)
    finally:os.close(directory)


def client(args):
    parse_request(args)
    raw=json.dumps({'args':args}).encode()+b'\n'
    if len(raw)>MAX_REQUEST:raise ValueError('request too large')
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
        connection.settimeout(40);connection.connect('/qa-media/decoder.sock');connection.sendall(raw)
        with connection.makefile('rb') as response:
            data=response.readline(2*MAX_OUTPUT+1)
    if len(data)>2*MAX_OUTPUT:raise ValueError('response too large')
    result=json.loads(data)
    stdout=base64.b64decode(result['stdout'],validate=True);stderr=base64.b64decode(result['stderr'],validate=True)
    if len(stdout)+len(stderr)>MAX_OUTPUT or not isinstance(result['exitCode'],int):raise ValueError('invalid decoder result')
    sys.stdout.buffer.write(stdout);sys.stderr.buffer.write(stderr)
    return result['exitCode'] if 0<=result['exitCode']<=255 else 1



@contextmanager
def bridge(run,script):
    root=run/'qa-temp';root.mkdir(mode=0o700)
    directory=run/'qa-media';directory.mkdir(mode=0o700)
    client_script=directory/'client';client_script.write_bytes(script.read_bytes());client_script.chmod(0o700)
    path=directory/'decoder.sock'
    process=subprocess.Popen(['/usr/bin/setpriv','--no-new-privs','/usr/bin/python3','-I',str(script),'--socket',str(path),'--root',str(root)],
                             stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                             env={'PATH':'/usr/bin:/bin','HOME':str(Path.home())})
    try:
        for _ in range(100):
            if process.poll() is not None:raise ValueError('media bridge unavailable')
            if path.is_socket():break
            time.sleep(0.05)
        else:raise ValueError('media bridge startup timeout')
        yield [(root,'/qa-temp',False),(directory,'/qa-media',True),(client_script,'/usr/bin/bwrap',True)]
    finally:
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=3)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)
        path.unlink(missing_ok=True)


def main():
    if Path(sys.argv[0]).name=='bwrap':return client(sys.argv[1:])
    parser=argparse.ArgumentParser();parser.add_argument('--socket',type=Path,required=True);parser.add_argument('--root',type=Path,required=True);args=parser.parse_args()
    serve(args.socket,args.root)

if __name__=='__main__':
    try:sys.exit(main())
    except Exception:
        print('Isolated decoder unavailable; details withheld.',file=sys.stderr);sys.exit(1)
