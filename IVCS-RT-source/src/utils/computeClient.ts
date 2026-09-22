export function compute<T=any>(kind:string,args:unknown[],options:{signal?:AbortSignal;progress?:(p:any)=>void}={}):Promise<T>{
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../workers/compute.worker.ts',import.meta.url),{type:'module'});
    let stopped=false,acknowledge:(()=>void)|undefined;
    const finish=()=>{stopped=true;acknowledge?.();acknowledge=undefined;worker.terminate();options.signal?.removeEventListener('abort',abort);};
    const abort=()=>{finish();reject(new Error('Operación cancelada.'));};
    if(options.signal?.aborted){abort();return;}options.signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>{if(data.ready){acknowledge?.();acknowledge=undefined;return;}if(data.progress){options.progress?.(data.progress);return;}finish();if(data.error)reject(new Error(data.error));else resolve(data.result);};
    worker.onerror=e=>{finish();reject(new Error(e.message || 'Falló el cálculo local.'));};
    // Avoid copying the retained native volume for contour-only export, and avoid
    // copying a derived grid when registration can operate directly on the native data.
    const payload=kind==='export'?[{...(args[0] as object),sourceVolume:undefined},...args.slice(1)]:kind==='registration'?[(args[0] as any).sourceVolume || args[0],(args[1] as any).sourceVolume || args[1],...args.slice(2)]:args;
    if(kind==='registration'){
      const send=(kind:string,args:any[],transfer:Transferable[]=[])=>new Promise<void>(resolve=>{acknowledge=resolve;worker.postMessage({kind,args},transfer);});
      void (async()=>{try{
        const volumes=payload.slice(0,2) as any[];
        await send('registrationInit',[...volumes.map(v=>({...v,slices:[],sourceVolume:undefined})),...payload.slice(2)]);
        for(let index=0;index<2;index++)for(const s of volumes[index].slices){if(stopped || options.signal?.aborted)return;const huData=s.huData.slice(),valid=s.valid?.slice();await send('registrationSlice',[index,{...s,huData,valid}],[huData.buffer,...(valid?[valid.buffer]:[])]);}
        if(!stopped && !options.signal?.aborted)worker.postMessage({kind:'registrationRun',args:[]});
      }catch(e){finish();reject(e);}})();
    }else worker.postMessage({kind,args:payload});
  });
}
