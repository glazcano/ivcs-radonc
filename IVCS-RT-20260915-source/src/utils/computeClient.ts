export function compute<T=any>(kind:string,args:unknown[],options:{signal?:AbortSignal;progress?:(p:any)=>void}={}):Promise<T>{
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../workers/compute.worker.ts',import.meta.url),{type:'module'});
    const finish=()=>{worker.terminate();options.signal?.removeEventListener('abort',abort);};
    const abort=()=>{finish();reject(new Error('Operación cancelada.'));};
    if(options.signal?.aborted){abort();return;}options.signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>{if(data.progress){options.progress?.(data.progress);return;}finish();if(data.error)reject(new Error(data.error));else resolve(data.result);};
    worker.onerror=e=>{finish();reject(new Error(e.message || 'Falló el cálculo local.'));};
    worker.postMessage({kind,args});
  });
}
