import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

export function projectCredits(root=process.cwd()){
  const manifest=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  const active=new Set(['react','react-dom','express','jszip','dicom-parser','lucide-react','dcmjs-codecs','three']);
  const unused=new Set(['@google/genai','dotenv','motion']);
  const names=[...new Set([...Object.keys(manifest.dependencies || {}),...Object.keys(manifest.devDependencies || {})])].sort();
  const credits=[],notices=['IVCS RT — Licenses of direct project dependencies / Licencias de dependencias directas\n'];
  for(const name of names){
    const dir=path.join(root,'node_modules',name),pkg=JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8'));
    const repository=typeof pkg.repository==='string'?pkg.repository:pkg.repository?.url;
    const url=(pkg.homepage || repository || '').replace(/^git\+/,'').replace(/\.git$/,'');
    credits.push({name,license:typeof pkg.license==='string'?pkg.license:'Ver avisos de licencia',url:url.startsWith('https://')?url:'',usage:active.has(name)?'Ejecución local':unused.has(name)?'Declarada en el proyecto; sin uso en la ejecución actual':'Herramientas de desarrollo y compilación'});
    const files=readdirSync(dir).filter(file=>/^licen[cs]e(?:\.|$)/i.test(file));
    notices.push('\n=== '+name+' ===\n');
    for(const file of files)notices.push(readFileSync(path.join(dir,file),'utf8'));
    if(!files.length)notices.push('License identifier: '+pkg.license+'\n'+url);
  }
  // Include notices for installed transitive packages too; build-only tools are not shipped as executables.
  const visited=new Set(names);
  for(const folder of readdirSync(path.join(root,'node_modules/.pnpm'))){
    const base=path.join(root,'node_modules/.pnpm',folder,'node_modules');
    let entries;try{entries=readdirSync(base);}catch{continue;}
    for(const entry of entries){
      const dirs=entry.startsWith('@')?readdirSync(path.join(base,entry)).map(n=>path.join(base,entry,n)):[path.join(base,entry)];
      for(const dir of dirs){
        let pkg;try{pkg=JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8'));}catch{continue;}
        if(visited.has(pkg.name))continue;visited.add(pkg.name);
        notices.push('\n=== '+pkg.name+' ('+String(pkg.license || 'See package notices')+') ===\n');
        for(const file of readdirSync(dir).filter(f=>/^(license|licence|notice|copying)(\.|$)/i.test(f)))try{notices.push(readFileSync(path.join(dir,file),'utf8'));}catch{}
      }
    }
  }
  notices.push('\n=== Native DICOM codecs ===\n'+readFileSync(path.join(root,'scripts/CODEC_LICENSES.txt'),'utf8'));
  credits.push({name:'Node.js',license:'MIT y licencias de componentes incluidos',url:'https://nodejs.org/',usage:'Ejecutor del servicio local'});
  notices.push('\n=== Node.js and bundled components ===\n'+readFileSync(path.join(root,'scripts/NODE_LICENSE.txt'),'utf8'));
  return {credits,notices:notices.join('\n')};
}
