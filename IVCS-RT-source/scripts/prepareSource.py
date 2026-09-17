"""Prepare an allowlisted source snapshot; never copies a working patient library."""
from pathlib import Path
import hashlib,json,re,shutil,sys,zipfile
root=Path(__file__).resolve().parent.parent
output=root/'source-release'
name=sys.argv[1] if len(sys.argv)>1 else 'IVCS-RT-20260915-source'
if not re.fullmatch(r'[A-Za-z0-9_-]+',name):raise SystemExit('Invalid output name')
target=output/name
if target.exists():raise SystemExit('Destination already exists; choose a new name')
folders=['src','server','scripts','tests','docs','translations','.github']
files=[root/p for p in ['.gitignore','.gitattributes','.env.example','README.md','LICENSE','IMPLEMENTATION.md','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vite.config.ts','index.html','metadata.json','public/LICENSE.txt','validation/README.md']]
for folder in folders:files.extend(p for p in (root/folder).rglob('*') if p.is_file())
allowed={'.ts','.tsx','.js','.mjs','.cjs','.mts','.md','.json','.yaml','.yml','.txt','.py','.ps1','.d.ts','.dcm','.css','.html','.svg'}
patterns={
 'google_key':rb'AIza[0-9A-Za-z_-]{30,}',
 'private_key':rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
 'token':rb'(?:sk-proj-|ghp_|github_pat_|gsk_)[A-Za-z0-9_-]{20,}',
 'aws_key':rb'(?:AKIA|ASIA)[A-Z0-9]{16}',
 'credential_assignment':rb'''(?i)(?:api[_-]?key|secret|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_+/=-]{24,}["']'''
}
manifest=[]
for file in sorted(set(files)):
 rel=file.relative_to(root).as_posix()
 if file.is_symlink():raise SystemExit('Symlink not allowed: '+rel)
 if file not in files[:14] and file.suffix not in allowed and rel not in ['.gitignore','.gitattributes','.env.example','LICENSE']:raise SystemExit('Unexpected source file: '+rel)
 if file.suffix=='.dcm' and rel!='tests/fixtures/synthetic-ct.dcm':raise SystemExit('Non-allowlisted DICOM: '+rel)
 data=file.read_bytes()
 for kind,pattern in patterns.items():
  if re.search(pattern,data):raise SystemExit('Potential '+kind+' in '+rel+'; inspect before publishing')
 if re.search(rb'[A-Za-z]:[/\\]Users[/\\][^/\\\s]+',data):raise SystemExit('Local absolute path in '+rel)
 manifest.append({'path':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
# Audit before creating/copying any output. One synthetic test fixture is explicitly allowed.
target.mkdir(parents=True)
for entry in manifest:
 destination=target/entry['path'];destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/entry['path'],destination)
archive=output/(name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for entry in manifest:z.write(target/entry['path'],name+'/'+entry['path'])
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
report={'files':manifest,'source_zip_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'excluded':'Patient libraries, working data, releases, builds, backups, screenshots, local credentials, node_modules, legacy bun.lock. One allowlisted synthetic DICOM fixture is included.','secret_scan':'No matches for configured credential patterns; not an exhaustive secret detector.'}
(output/(name+'-audit.json')).write_text(json.dumps(report,indent=2),encoding='utf8')
print(str(target));print(str(archive));print(str(len(manifest))+' files; SHA256 '+report['source_zip_sha256'])
