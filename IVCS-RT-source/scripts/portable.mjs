import {promises as fs} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';

if(!process.argv.includes('--personal'))throw new Error('This command includes your working patient library. Use --personal explicitly, or release:stage for public synthetic packages.');
const destination=path.resolve('RadContour-portable');
await fs.mkdir(path.join(destination,'runtime'),{recursive:true});
await build({entryPoints:['server/main.mjs'],bundle:true,platform:'node',format:'cjs',outfile:path.join(destination,'server.cjs')});
await fs.cp('dist',path.join(destination,'dist'),{recursive:true});
await fs.copyFile(process.execPath,path.join(destination,'runtime','node.exe'));
await fs.copyFile('scripts/NODE_LICENSE.txt',path.join(destination,'runtime','LICENSE_NODE.txt'));
// Existing portable cases are never overwritten by a subsequent build.
try {await fs.access(path.join(destination,'data'));}catch {
  try {await fs.cp('data',path.join(destination,'data'),{recursive:true});}
  catch(e) {if(e.code!=='ENOENT')throw e;await fs.mkdir(path.join(destination,'data'));}
}
await fs.mkdir(path.join(destination,'translations'),{recursive:true});
await fs.cp('translations',path.join(destination,'translations'),{recursive:true,force:false});
await fs.cp('docs',path.join(destination,'docs'),{recursive:true});
await fs.cp('validation',path.join(destination,'validation'),{recursive:true});
await fs.copyFile('scripts/Iniciar.ps1',path.join(destination,'Iniciar.ps1'));
await fs.copyFile('scripts/Detener.ps1',path.join(destination,'Detener.ps1'));
await fs.writeFile(path.join(destination,'Iniciar.cmd'),'@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Iniciar.ps1"\r\n');
await fs.writeFile(path.join(destination,'Detener.cmd'),'@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Detener.ps1"\r\n');
await fs.writeFile(path.join(destination,'LEEME.txt'),'IVCS RT local para Windows x64\r\n\r\n1. Doble clic en Iniciar.cmd.\r\n2. Para cerrar el servicio local, ejecutar Detener.cmd.\r\n3. Antes de mover o copiar, pulse Guardar (Ctrl+S), espere a que termine y cierre con Detener.cmd.\r\n4. Copie esta carpeta COMPLETA, incluida data. No necesita instalar Node ni conexión a Internet.\r\n\r\nGuardado manual: use Guardar o Ctrl+S. No hay autoguardado.\r\nBiblioteca > Administrar biblioteca abre una vista independiente con papelera y exportación por lotes. La papelera conserva archivos y ocupa espacio.\r\nExportación TPS: ZIP con RTSTRUCT guardados e informe.json; DICOM originales opcionales.\r\n\r\nLos datos son locales, no están cifrados y no se sincronizan.\r\nNo abra dos copias sobre la misma carpeta data.\r\n');
console.log(destination);
