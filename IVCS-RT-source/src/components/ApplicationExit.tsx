import React,{useEffect,useRef,useState} from 'react';
import {tr} from '../i18n';
import {hasOtherApplicationWindows} from '../utils/applicationPeers';

export function ApplicationExit({dirty,busy,save,onDialogChange}:{dirty:()=>boolean;busy:boolean;save:()=>Promise<void>;onDialogChange:(open:boolean)=>void}){
 const [open,setOpen]=useState(false),[working,setWorking]=useState(false),[closed,setClosed]=useState(false),[serverStopped,setServerStopped]=useState(false),[error,setError]=useState('');
 const status=useRef<{token:string}|null>(null),finished=useRef(false),latest=useRef({dirty,busy});latest.current={dirty,busy};
 useEffect(()=>{
  let alive=true;
  fetch('/api/application/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(s=>{if(alive&&s?.application==='IVCS RT'&&s.shutdown)status.current=s;}).catch(()=>{});
  const request=()=>{if(!finished.current){setError('');setOpen(true);}};
  const guard=(e:BeforeUnloadEvent)=>{if(!finished.current&&(status.current||latest.current.dirty()||latest.current.busy)){e.preventDefault();e.returnValue='';setOpen(true);}};
  window.addEventListener('ivcs-exit-request',request);window.addEventListener('beforeunload',guard);
  return()=>{alive=false;window.removeEventListener('ivcs-exit-request',request);window.removeEventListener('beforeunload',guard);};
 },[]);
 useEffect(()=>{onDialogChange(open||closed);},[open,closed,onDialogChange]);
 const exit=async(withSave:boolean)=>{
  if(working||busy)return;setWorking(true);setError('');
  try{
   if(await hasOtherApplicationWindows())throw new Error('Cierre las otras ventanas de IVCS RT, incluida la biblioteca, antes de detener el servidor. Guarde primero sus cambios.');
   if(!status.current)throw new Error('Este servidor no permite cierre desde la interfaz. Guarde los cambios y use Stop.cmd o el terminal que inició el programa.');
   if(withSave&&dirty())await save();
   const response=await fetch('/api/application/shutdown',{method:'POST',headers:{'Content-Type':'application/json','X-RadContour':'local'},body:JSON.stringify({token:status.current.token})});
   if(!response.ok)throw new Error('No se pudo detener el servidor. La ventana permanecerá abierta; puede intentar nuevamente.');
   const result=await response.json();if(result.stopping!==true)throw new Error('Respuesta de cierre no válida.');
   finished.current=true;setClosed(true);setOpen(false);window.dispatchEvent(new Event('ivcs-shutdown-complete'));
   // Wait for outstanding requests to drain. A successful status response means it is still running.
   let stopped=false;
   for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));try{await fetch('/api/application/status',{cache:'no-store',signal:AbortSignal.timeout(500)});}catch{stopped=true;break;}}
   if(!stopped){setError('El servidor está terminando operaciones pendientes. Espere antes de mover la carpeta portable.');return;}
   setServerStopped(true);window.close();
  }catch(e){setError((e as Error).message);}finally{setWorking(false);}
 };
 if(closed)return <div className="fixed inset-0 z-[500] bg-zinc-950 text-zinc-200 flex items-center justify-center p-6"><section role="status" className="max-w-lg space-y-4"><h1 className="text-xl">IVCS RT</h1><p>{tr(serverStopped?'Servidor detenido. Ya puede cerrar esta pestaña.':'Cerrando el servidor local…')}</p>{error&&<p role="alert">{tr(error)}</p>}<p>{tr('Para volver a utilizar IVCS RT, ejecute el iniciador del programa.')}</p></section></div>;
 if(!open)return null;
 return <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label={tr('Cerrar IVCS RT')} className="max-w-xl bg-zinc-900 text-zinc-200 border border-zinc-600 rounded p-6 space-y-4"><h2 className="text-lg">{tr('Cerrar IVCS RT')}</h2><p>{tr('El cierre detendrá el servidor local para todas las ventanas. Guarde cualquier otro caso abierto antes de continuar.')}</p><p className="text-sm text-zinc-400">{tr('Cerrar la pestaña con la X no detiene el servidor ni guarda cambios. Use estos botones para cerrar el programa. El navegador puede pedir que cierre la pestaña manualmente.')}</p>{dirty()&&<p className="text-amber-300">{tr('Hay cambios sin guardar')}</p>}{error&&<p role="alert" className="text-red-300">{tr(error)}</p>}{busy&&<p role="status">{tr('Espere a que termine la operación actual antes de cerrar.')}</p>}<div className="flex flex-wrap gap-3"><button data-testid="exit-save" className="bg-blue-700 rounded px-3 py-2 disabled:opacity-40" disabled={busy||working} onClick={()=>void exit(true)}>{tr(dirty()?'Guardar y cerrar':'Cerrar programa')}</button>{dirty()&&<button data-testid="exit-discard" className="border border-red-500 rounded px-3 py-2 disabled:opacity-40" disabled={busy||working} onClick={()=>void exit(false)}>{tr('Cerrar sin guardar')}</button>}<button className="border border-zinc-500 rounded px-3 py-2" disabled={working} onClick={()=>setOpen(false)}>{tr('Cancelar')}</button></div></section></div>;
}
