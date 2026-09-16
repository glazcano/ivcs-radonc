from pathlib import Path
import json,hashlib,zipfile,tarfile,re,sys
root=(Path('releases')/(sys.argv[1] if len(sys.argv)>1 else '20260909')).resolve()
patterns={'google_api_key':rb'AIza[0-9A-Za-z_-]{30,}','private_key':rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----','access_token':rb'(?:sk-proj-|ghp_|github_pat_|gsk_)[A-Za-z0-9_-]{20,}','aws_key':rb'(?:AKIA|ASIA)[A-Z0-9]{16}'}
reports=[]
for folder in sorted(p for p in root.iterdir() if p.is_dir()):
 index=json.loads((folder/'data/index.json').read_text())
 assert len(index['patients'])==1
 patient=index['patients'][0]
 assert patient['id']=='SYNTHETIC-LB-20260909' and patient['name']=='Bello^Luciano' and len(patient['studies'])==2
 assert {s['modality'] for s in patient['studies']}=={'CT','MR'}
 files=sorted(p for p in folder.rglob('*') if p.is_file())
 findings=[]
 for f in files:
  rel=f.relative_to(folder).as_posix()
  assert not (f.name.startswith('.env') or f.suffix in ['.tsx','.ts','.map','.log','.pid'] or 'node_modules' in f.parts),rel
  b=f.read_bytes()
  for label,pattern in patterns.items():
   if rel not in ['runtime/node','runtime/node.exe'] and re.search(pattern,b):findings.append({'file':rel,'category':label})
  if f.suffix in ['.sh','.command']:assert b'\r' not in b
 assert not findings,findings
 report={'package':folder.name,'files':len(files),'patientCount':1,'syntheticPatientID':patient['id'],'studies':['CT','MR'],'credentialPatternFindings':findings,'editableApplicationSources':False,'sourceMaps':False}
 reports.append(report)
 (folder/'MANIFEST.json').write_text(json.dumps({f.relative_to(folder).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in files},indent=2),encoding='utf8')
 if 'Windows' in folder.name:
  archive=root/(folder.name+'.zip')
  with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
   for f in folder.rglob('*'):
    if f.is_file():z.write(f,f.relative_to(root).as_posix())
  with zipfile.ZipFile(archive) as z:assert z.testzip() is None
 else:
  archive=root/(folder.name+'.tar.gz')
  def permissions(info):
   info.uid=info.gid=0;info.uname=info.gname=''
   info.mode=0o755 if info.isdir() or info.name.endswith(('/runtime/node','.sh','.command')) else 0o644
   return info
  with tarfile.open(archive,'w:gz',compresslevel=6) as t:t.add(folder,arcname=folder.name,filter=permissions)
  with tarfile.open(archive,'r:gz') as t:
   for item in t:
    assert not item.name.startswith('/') and '..' not in Path(item.name).parts
    if item.name.endswith('/runtime/node'):assert item.mode==0o755
 print(archive.name,round(archive.stat().st_size/1048576,1),'MiB',flush=True)
(root/'security-report.json').write_text(json.dumps({'scope':'Clean release directories; known credential patterns in application files and allowlisted synthetic library. Official Node binaries excluded from pattern matching; their download SHA256 was verified against nodejs.org. This is not a guarantee against every possible secret format.','packages':reports},indent=2),encoding='utf8')
archives=sorted([*root.glob('*.zip'),*root.glob('*.tar.gz')])
(root/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in archives),encoding='ascii')

