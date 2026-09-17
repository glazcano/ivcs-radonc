export function compute<T=any>(kind:string,args:unknown[],options:{signal?:AbortSignal;progress?:(p:any)=>void}={}):Promise<T>{
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../workers/compute.worker.ts',import.meta.url),{type:'module'});
    const finish=()=>{worker.terminate();options.signal?.removeEventListener('abort',abort);};
    const abort=()=>{finish();reject(new Error('Operación cancelada.'));};
    if(options.signal?.aborted){abort();return;}options.signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>{if(data.progress){options.progress?.(data.progress);return;}finish();if(data.error)reject(new Error(data.error));else resolve(data.result);};
    worker.onerror=e=>{finish();reject(new Error(e.message || 'Falló el cálculo local.'));};
    // Avoid copying the retained native volume for contour-only export, and avoid
    // copying a derived grid when registration can operate directly on the native data.
    const payload=kind==='export'?[{...(args[0] as object),sourceVolume:undefined},...args.slice(1)]:kind==='registration'?[(args[0] as any).sourceVolume || args[0],(args[1] as any).sourceVolume || args[1],...args.slice(2)]:args;
    worker.postMessage({kind,args:payload});
  });
}
