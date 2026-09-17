import {promises as fs} from 'node:fs';
import path from 'node:path';
export async function readTranslations(directory=path.resolve('translations')){
 const translations=[],warnings=[],codes=new Set();let files=[];
 try{files=await fs.readdir(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const file of files.filter(f=>f.endsWith('.json')).sort()){
  try{const bytes=await fs.readFile(path.join(directory,file),'utf8');if(bytes.length>2000000)throw new Error('Archivo demasiado grande');const p=JSON.parse(bytes.replace(/^\uFEFF/,''));
   if(p.schemaVersion!==1 || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(p.language?.code || '') || typeof p.language.name!=='string' || !p.language.name.trim() || !['ltr','rtl'].includes(p.language.direction) || !p.messages || typeof p.messages!=='object' || Array.isArray(p.messages) || Object.values(p.messages).some(v=>typeof v!=='string'))throw new Error('Cabecera o mensajes inválidos');
   if(codes.has(p.language.code))throw new Error('Código de idioma duplicado');
   for(const [key,value] of Object.entries(p.messages)){const placeholders=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort().join(',');if(placeholders(key)!==placeholders(value))throw new Error('Marcadores incompatibles: '+key);}
   codes.add(p.language.code);translations.push(p);
  }catch(e){warnings.push(file+': '+e.message);}
 }
 return {translations,warnings};
}
