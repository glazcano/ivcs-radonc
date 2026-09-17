let worker:Worker|undefined;
let queue:Promise<unknown>=Promise.resolve();
export function decodeCompressedDicom(bytes:Uint8Array):Promise<Uint8Array>{
 const run=async()=>{
  if(typeof Worker==='undefined')return (await import('./dicomCodecs')).decompress(bytes);
  worker ||= new Worker(new URL('../workers/dicom.worker.ts',import.meta.url),{type:'module'});
  return new Promise<Uint8Array>((resolve,reject)=>{
   const timer=setTimeout(()=>{worker?.terminate();worker=undefined;reject(new Error('DICOM decoder timed out.'));},120000);
   worker!.onmessage=e=>{clearTimeout(timer);e.data.error?reject(new Error(e.data.error)):resolve(e.data.bytes);};
   worker!.onerror=e=>{clearTimeout(timer);worker?.terminate();worker=undefined;reject(new Error(e.message));};
   const copy=bytes.slice();worker!.postMessage(copy,[copy.buffer]);
  });
 };
 const next=queue.then(run,run);queue=next.catch(()=>{});return next;
}
