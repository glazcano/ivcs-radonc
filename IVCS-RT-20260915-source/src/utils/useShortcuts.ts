import {useEffect,useState} from 'react';
import {defaultShortcuts,validShortcuts} from './shortcuts';
import {getPreferences} from './libraryClient';
export function useShortcuts(){const [keys,setKeys]=useState(defaultShortcuts);useEffect(()=>{const changed=(e:Event)=>setKeys((e as CustomEvent).detail);getPreferences().then(p=>{if(validShortcuts(p.shortcuts))setKeys(p.shortcuts);}).catch(()=>{});window.addEventListener('shortcuts-updated',changed);return()=>window.removeEventListener('shortcuts-updated',changed);},[]);return keys;}
