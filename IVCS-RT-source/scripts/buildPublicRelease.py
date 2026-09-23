"""Fresh public packages from current dist/server + a newly generated synthetic demo.

Run pnpm release:stage first. No previous release or working data is read.
Official Node archives are verified against the cached official SHASUMS256.txt.
"""
from pathlib import Path
import hashlib,json,shutil,sys,tarfile,zipfile,re,os
root=Path(__file__).resolve().parent.parent
revision=sys.argv[1] if len(sys.argv)>1 else ''
if not re.fullmatch(r'\d{8}',revision):raise SystemExit('Pass an eight-digit revision date')
label=sys.argv[2] if len(sys.argv)>2 else ''
if label and not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',label):raise SystemExit('Invalid release label')
build_id=f'{revision}-{label}' if label else revision
out=root/'releases'/(build_id if label else f'{revision}-consolidation')
if out.exists():raise SystemExit('Destination exists; refusing to mix builds')
cache=root/'build/release-cache'
lock=json.loads((root/'scripts/nodeRuntime.json').read_text())
version=lock['version'];checks=lock['archives']
demo=root/'build/release-common'
index=json.loads((demo/'data/index.json').read_text())
assert len(index['patients'])==1 and index['patients'][0]['id']=='SYNTHETIC-LB-20260909'
archives=[]
for platform in ['win-x64','darwin-arm64','darwin-x64','linux-x64','linux-arm64']:
    name=f'node-v{version}-{platform}'+('.zip' if platform.startswith('win') else '.tar.gz')
    archive=cache/name
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=checks.get(name):raise SystemExit(f'Runtime checksum mismatch: {name}')
    archives.append((platform,name,archive))
out.mkdir(parents=True)
for platform,name,archive in archives:
    target=out/f'IVCS-RT-{build_id}-{platform}';target.mkdir()
    shutil.copytree(root/'dist',target/'dist');shutil.copytree(root/'translations',target/'translations')
    shutil.copytree(demo/'data',target/'data')
    shutil.copytree(root/'docs',target/'docs')
    shutil.copytree(demo/'demo',target/'demo')
    for item in demo.iterdir():
        if item.is_file():shutil.copy2(item,target/item.name)
    for source,dest in [('build/public-server.cjs','server.cjs'),('scripts/releaseLauncher.mjs','launcher.mjs'),('LICENSE','LICENSE'),('scripts/CODEC_LICENSES.txt','CODEC_LICENSES.txt')]:shutil.copy2(root/source,target/dest)
    runtime=target/'runtime';runtime.mkdir()
    prefix=f'node-v{version}-{platform}/'
    if platform.startswith('win'):
        with zipfile.ZipFile(archive) as z:
            (runtime/'node.exe').write_bytes(z.read(prefix+'node.exe'))
            (runtime/'LICENSE_NODE.txt').write_bytes(z.read(prefix+'LICENSE'))
        for label,arg in [('Start',''),('Stop',' stop')]:
            (target/f'{label}.cmd').write_text('@echo off\n"%~dp0runtime\\node.exe" "%~dp0launcher.mjs"'+arg+'\n')
    else:
        with tarfile.open(archive) as t:
            (runtime/'node').write_bytes(t.extractfile(prefix+'bin/node').read())
            (runtime/'LICENSE_NODE.txt').write_bytes(t.extractfile(prefix+'LICENSE').read())
        (runtime/'node').chmod(0o755)
        for label,arg in [('Start',''),('Stop',' stop')]:
            f=target/(label+('.command' if platform.startswith('darwin') else '.sh'))
            f.write_bytes(('#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec ./runtime/node ./launcher.mjs'+arg+'\n').encode('utf8'));f.chmod(0o755)
    (target/'release.json').write_text(json.dumps({'revision':revision,'platform':platform,'runtime':version,'runtimeSHA256':checks[name],'nativeExecutionTested':False,'syntheticOnly':True},indent=2))
    (target/'README.txt').write_text(f'IVCS RT — {revision}\nUse Start to open. Use Close application inside IVCS RT to save and stop the server; Stop remains available as a fallback. Closing the browser tab alone does not stop Node or save changes. All patient data is local in data/.\nOnly a synthetic demo is included. To migrate, stop both copies and copy the entire old data folder, keeping a backup.\nSee docs/CURRENT_STATUS.md for supported features, limitations and external validation still pending.\nMIT — Gabriel Lazcano.\n',encoding='utf8')
print(out)
