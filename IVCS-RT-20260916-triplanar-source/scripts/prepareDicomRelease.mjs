import {promises as fs} from 'node:fs';import path from 'node:path';import {build} from 'esbuild';import {createLibrary} from '../server/library.mjs';
const revision=process.argv[3] || '20260916',destination=path.resolve('releases',process.argv[2] || revision);await fs.mkdir(destination,{recursive:true});
await build({entryPoints:['server/main.mjs'],bundle:true,platform:'node',format:'cjs',minify:true,sourcemap:false,outfile:'build/server-'+revision+'.cjs'});
for(const name of await fs.readdir('releases/20260909')){
 const original=path.resolve('releases/20260909',name);if(!(await fs.stat(original)).isDirectory())continue;
 const target=path.join(destination,name.replace('20260909',revision));await fs.mkdir(target);
 for(const entry of await fs.readdir(original))if(!['dist','MANIFEST.json'].includes(entry))await fs.cp(path.join(original,entry),path.join(target,entry),{recursive:true});
 await fs.cp('dist',path.join(target,'dist'),{recursive:true});await fs.copyFile('build/server-'+revision+'.cjs',path.join(target,'server.cjs'));await fs.cp('translations',path.join(target,'translations'),{recursive:true});
 await fs.copyFile('docs/DICOM_FIXES_20260915.md',path.join(target,'DICOM_FIXES.md'));
 await fs.copyFile('docs/VIEWS_3D_20260915.md',path.join(target,'VIEWS_3D.md'));
 await fs.copyFile('docs/DICOM_ZIP_20260915.md',path.join(target,'DICOM_ZIP.md'));
 await fs.copyFile('docs/OBLIQUE_20260916.md',path.join(target,'OBLIQUE.md'));
 await fs.copyFile('docs/ACQUISITIONS_20260916.md',path.join(target,'ACQUISITIONS_20260916.md'));
 await fs.copyFile('docs/LARGE_STUDY_FIX_20260916.md',path.join(target,'LARGE_STUDY_FIX.md'));
 await fs.copyFile('docs/REGISTRATION_FIX_20260916.md',path.join(target,'REGISTRATION_FIX.md'));
 await fs.copyFile('docs/REGISTRATION_TRIPLANAR_20260916.md',path.join(target,'REGISTRATION_TRIPLANAR.md'));
 const metadata=JSON.parse(await fs.readFile(path.join(target,'release.json'),'utf8'));metadata.revision=revision;metadata.features=['raw-dicom-acquisitions','1+2-layout','3d-contours','dicom-zip','spatial-registration-export','oblique-acquisition-resampling','enhanced-dicom','irregular-acquisitions','4d-review','float32-maps','streamed-large-study-opening','triplanar-registration','physical-plane-drag','automatic-voi','live-registration-preview','linked-registration-conflicts'];metadata.nativeExecutionTested=false;await fs.writeFile(path.join(target,'release.json'),JSON.stringify(metadata,null,2));
 const readme=await fs.readFile(path.join(target,'README.txt'),'utf8');await fs.writeFile(path.join(target,'README.txt'),readme.replace('IVCS RT — 20260909','IVCS RT — '+revision)+'\nDICOM fixes and migration details: DICOM_FIXES.md\n');
 await createLibrary(path.join(target,'data')).list();console.log(path.basename(target));
 await fs.appendFile(path.join(target,'README.txt'),'\nRegistration review build: REGISTRATION_TRIPLANAR.md. Includes synchronized triplanar layouts, physical translation/rotation, automatic VOI, live proposals, linked-series conflict resolution and new-volume Auto BODY default.\n');
 await fs.appendFile(path.join(target,'README.txt'),'\nLatest changes: ACQUISITIONS_20260916.md and LARGE_STUDY_FIX.md.\nTo retain your existing library, close the old application and copy its complete data folder into this extracted package, replacing only the included synthetic-demo data folder. Keep your original folder as a backup. Do not run both copies against the same data folder. Updating the browser files alone is insufficient: use the included server.cjs as well.\n');
}
