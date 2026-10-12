export interface StudyReadOptions {
 signal?:AbortSignal;
 onProgress?:(bytes:number)=>void;
 maxRecordBytes?:number;
 maxDecodedBytes?:number;
 maxTransferBytes?:number;
}
/** Consume bounded records, decoding image arrays immediately. The reference in
 * `studies` aliases `selected`; neither text nor pixel arrays are duplicated. */
export async function readStudyStream(response:Response,decode:(text:string)=>any,options:StudyReadOptions={}){
 const {signal,onProgress}=options;signal?.throwIfAborted();
 const maxRecord=options.maxRecordBytes ?? 64*1024*1024,maxDecoded=options.maxDecodedBytes ?? 2*1024*1024*1024,maxTransfer=options.maxTransferBytes ?? 4*1024*1024*1024;
 let received=0,decoded=0;
 if(!response.body)throw new Error('Empty study response.');
 const reader=response.body.getReader(),decoder=new TextDecoder(),counts:number[]=[];let pending='',result:any,ended=false,masks=0;
 const accept=(line:string)=>{
  if(!line)return;if(ended)throw new Error('Unexpected data after study transfer.');
  if(new TextEncoder().encode(line).byteLength>maxRecord)throw new Error('Study record exceeds the supported size.');
  const record=decode(line);
  const account=(value:any)=>{if(ArrayBuffer.isView(value)){decoded+=value.byteLength;if(decoded>maxDecoded)throw new Error('Study exceeds the decoded memory limit.');}else if(value && typeof value==='object')for(const v of Object.values(value))account(v);};
  account(record);
  if(!result){
   if(record.kind!=='header' || record.format!=='ivcs-study-stream' || record.version!==1 || !record.selected)throw new Error('Unsupported study stream.');
   if(!Array.isArray(record.selected.slices) || record.selected.slices.length || (record.selected.sourceVolume && (!Array.isArray(record.selected.sourceVolume.slices) || record.selected.sourceVolume.slices.length || record.selected.sourceVolume.sourceVolume)))throw new Error('Invalid study header.');
   if(record.state && (!Array.isArray(record.state.rois) || record.state.rois.some((r:any)=>!r.sliceMasks || Object.keys(r.sliceMasks).length)))throw new Error('Invalid mask header.');
   result={selected:record.selected,studies:[record.selected],state:record.state,revision:record.revision};return;
  }
  if(record.kind==='slice'){
   if(!Number.isInteger(record.depth) || record.depth<0 || record.depth>1)throw new Error('Invalid source volume.');
   let volume=result.selected;for(let d=0;d<record.depth;d++)volume=volume?.sourceVolume;
   if(!volume || record.index!==volume.slices.length || !record.slice)throw new Error('Incomplete or unordered study images.');
   const slice=record.slice;
   if(!(slice.huData instanceof Int16Array || slice.huData instanceof Float32Array))throw new Error('Invalid image array.');
   if(!Number.isSafeInteger(slice.rows) || !Number.isSafeInteger(slice.cols) || slice.rows<=0 || slice.cols<=0 || slice.rows*slice.cols!==slice.huData.length || (slice.valid!==undefined && (!(slice.valid instanceof Uint8Array) || slice.valid.length!==slice.huData.length)))throw new Error('Invalid image dimensions.');
   volume.slices.push(record.slice);counts[record.depth]=(counts[record.depth] || 0)+1;return;
  }
  if(record.kind==='mask'){
   const roi=result.state?.rois?.[record.roiIndex];
   if(!Number.isInteger(record.roiIndex) || record.roiIndex<0 || !roi || !/^\d+$/.test(record.z) || !result.selected.slices[Number(record.z)] || Object.hasOwn(roi.sliceMasks,record.z))throw new Error('Invalid study mask reference.');
   if(!(record.mask instanceof Uint8Array))throw new Error('Invalid mask array.');
   const slice=result.selected.slices[Number(record.z)],scale=roi.maskScale ?? 1;
   if(![1,2].includes(scale) || (slice.rows && record.mask.length!==slice.rows*slice.cols*scale*scale))throw new Error('Invalid mask dimensions.');
   roi.sliceMasks[record.z]=record.mask;masks++;return;
  }
  if(record.kind==='end'){
   if(!counts.length || JSON.stringify(record.counts)!==JSON.stringify(counts) || record.masks!==masks)throw new Error('Incomplete study transfer.');
   ended=true;return;
  }
  throw new Error('Unknown study record.');
 };
 const abort=()=>{void reader.cancel(signal?.reason).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  signal?.throwIfAborted();
  for(;;){signal?.throwIfAborted();const {value,done}=await reader.read();signal?.throwIfAborted();if(value){received+=value.byteLength;if(received>maxTransfer)throw new Error('Study exceeds the transfer limit.');onProgress?.(received);signal?.throwIfAborted();}pending+=done?decoder.decode():decoder.decode(value,{stream:true});let start=0,end:number;
   while((end=pending.indexOf('\n',start))!==-1){accept(pending.slice(start,end));start=end+1;}
   pending=pending.slice(start);if(pending.length>maxRecord)throw new Error('Study record exceeds the supported size.');
   if(done)break;
  }
  if(pending)accept(pending);if(!ended)throw new Error('Incomplete study transfer. Please reopen the study.');return result;
 }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}
