"""Download pinned official runtimes. Never trust an unverified cached archive."""
from pathlib import Path
import json,hashlib,urllib.request
root=Path(__file__).resolve().parent.parent
lock=json.loads((root/'scripts/nodeRuntime.json').read_text())
cache=root/'build/release-cache';cache.mkdir(parents=True,exist_ok=True)
for name,expected in lock['archives'].items():
    target=cache/name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==expected:continue
    with urllib.request.urlopen(f"https://nodejs.org/dist/v{lock['version']}/{name}") as r:data=r.read()
    if hashlib.sha256(data).hexdigest()!=expected:raise SystemExit(f'Checksum mismatch: {name}')
    target.write_bytes(data)
print('Verified official runtimes in build/release-cache')
