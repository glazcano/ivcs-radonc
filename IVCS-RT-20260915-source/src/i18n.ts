import {useSyncExternalStore} from 'react';
export interface Translation {schemaVersion:1;language:{code:string;name:string;englishName?:string;direction:'ltr'|'rtl'};messages:Record<string,string>}
let packs:Translation[]=[],language='en';
const canonical=new Map<string,string>();let patterns:{source:string;regex:RegExp}[]=[];
const escapeRegex=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const listeners=new Set<()=>void>();
export function tr(key:string,values:unknown[]=[]):string{
 if(typeof key!=='string')return key;
 const pack=packs.find(p=>p.language.code===language);
 let source=canonical.get(key) || key,args=values;
 if(!values.length && !pack?.messages[source])for(const pattern of patterns){const match=pattern.regex.exec(key);if(match){source=pattern.source;args=match.slice(1);break;}}
 const result=pack?.messages[source] ?? source;
 return result.replace(/\{(\d+)\}/g,(match,n)=>Number(n)<args.length?String(args[Number(n)] ?? ''):match);
}
export function useLanguage(){return useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb);},()=>language,()=> 'en');}
export function availableLanguages(){return packs.map(p=>p.language);}
export async function reloadLanguages(){const response=await fetch('/api/library/translations');if(!response.ok)throw new Error('No se pudieron leer las traducciones.');const data=await response.json();packs=data.translations;canonical.clear();patterns=[];
 for(const p of packs)for(const [key,value] of Object.entries(p.messages)){
  if(!key.includes('{'))canonical.set(value,key);
  if(/\{\d+\}/.test(key) && !patterns.some(p=>p.source===key))patterns.push({source:key,regex:new RegExp('^'+key.split(/\{\d+\}/).map(escapeRegex).join('(.*?)')+'$')});
 }
 return data.warnings as string[];}
export async function initializeLanguage(){try{await reloadLanguages();const response=await fetch('/api/library/settings');const prefs=await response.json();language=packs.some(p=>p.language.code===prefs.language)?prefs.language:'en';document.documentElement.lang=language;document.documentElement.dir=packs.find(p=>p.language.code===language)?.language.direction || 'ltr';}catch{language='en';}}
export async function changeLanguage(code:string){if(!packs.some(p=>p.language.code===code))throw new Error('Idioma no disponible.');const response=await fetch('/api/library/settings',{method:'PUT',headers:{'Content-Type':'application/json','X-RadContour':'local'},body:JSON.stringify({language:code})});if(!response.ok)throw new Error('No se pudo guardar el idioma.');language=code;document.documentElement.lang=code;document.documentElement.dir=packs.find(p=>p.language.code===code)!.language.direction;listeners.forEach(fn=>fn());}
