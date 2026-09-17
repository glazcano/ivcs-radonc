import {tr} from '../i18n';
import React,{useEffect,useState} from 'react';
import {defaultShortcuts,validShortcuts} from '../utils/shortcuts';
import {getPreferences,savePreferences} from '../utils/libraryClient';
export function ShortcutSettings(){
 const [keys,setKeys]=useState(defaultShortcuts),[message,setMessage]=useState('');
 useEffect(()=>{getPreferences().then(p=>{if(validShortcuts(p.shortcuts))setKeys(p.shortcuts);}).catch(e=>setMessage(e.message));},[]);
 const labels:Record<string,string>={brush:tr("Pincel"),pencil:tr("Lápiz"),polygon:tr("Polígono"),eraser:tr("Borrador"),threshold:tr("Umbral conectado"),window:tr("Ventana"),pan:tr("Desplazar"),zoom:tr("Zoom"),ruler:tr("Regla")};
 return <details><summary className="cursor-pointer text-blue-200">{" "}{tr("Configurar atajos locales")}{" "}</summary><p>{" "}{tr("Espacio: desplazar mientras se mantiene. Alt: borrar mientras se mantiene. Ctrl+S: guardar. O: contorno abierto/cerrado. Las letras siguientes reemplazan los valores predeterminados de la guía.")}{" "}</p><div className="grid grid-cols-3 gap-2 mt-2">{Object.keys(defaultShortcuts).map(k=><label key={k}>{" "}{tr(labels[k])}{" "} <input aria-label={tr("Atajo ")+tr(labels[k])} className="bg-zinc-800 w-10 p-1" maxLength={1} value={keys[k]} onChange={e=>setKeys({...keys,[k]:e.target.value.toLowerCase()})}/></label>)}</div><button className="border rounded p-2 mt-2" onClick={async()=>{if(!validShortcuts(keys)){setMessage('Use letras únicas; O y S están reservadas.');return;}try{await savePreferences({shortcuts:keys});window.dispatchEvent(new CustomEvent('shortcuts-updated',{detail:keys}));setMessage('Atajos guardados.');}catch(e){setMessage((e as Error).message);}}}>{" "}{tr("Guardar atajos")}{" "}</button><button className="p-2" onClick={()=>setKeys(defaultShortcuts)}>{" "}{tr("Predeterminados")}{" "}</button><p role="status">{" "}{tr(message)}{" "}</p></details>;
}
