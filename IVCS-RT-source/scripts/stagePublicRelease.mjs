import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
// Never reuse a staging folder: it could contain modified demo cases.
if(existsSync('build/release-common'))throw new Error('Move build/release-common to a backup before generating a fresh public staging folder.');
const run=args=>{const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)throw new Error('Release staging failed');};
run(['node_modules/typescript/bin/tsc','--noEmit']);
run(['node_modules/vite/bin/vite.js','build']);
await build({entryPoints:['server/main.mjs'],bundle:true,platform:'node',format:'cjs',minify:true,sourcemap:false,outfile:'build/public-server.cjs'});
run(['--import','tsx','scripts/releaseDemo.ts']);
console.log('Fresh staging complete. Run python scripts/buildPublicRelease.py YYYYMMDD, then python scripts/packageRelease.py YYYYMMDD-consolidation.');
