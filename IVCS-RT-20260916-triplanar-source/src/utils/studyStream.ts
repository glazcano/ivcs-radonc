/** Consume bounded records, decoding image arrays immediately. The reference in
 * `studies` aliases `selected`; neither text nor pixel arrays are duplicated. */
export async function readStudyStream(response:Response,decode:(text:string)=>any){
 if(!response.body)throw new Error('Empty study response.');
 const reader=response.body.getReader(),decoder=new TextDecoder(),counts:number[]=[];let pending='',result:any,ended=false,masks=0;
 const accept=(line:string)=>{
  if(!line)return;if(ended)throw new Error('Unexpected data after study transfer.');
  const record=decode(line);
  if(!result){
   if(record.kind!=='header' || record.format!=='ivcs-study-stream' || record.version!==1 || !record.selected)throw new Error('Unsupported study stream.');
   result={selected:record.selected,studies:[record.selected],state:record.state,revision:record.revision};return;
  }
  if(record.kind==='slice'){
   if(!Number.isInteger(record.depth) || record.depth<0 || record.depth>1)throw new Error('Invalid source volume.');
   let volume=result.selected;for(let d=0;d<record.depth;d++)volume=volume?.sourceVolume;
   if(!volume || record.index!==volume.slices.length || !record.slice)throw new Error('Incomplete or unordered study images.');
   volume.slices.push(record.slice);counts[record.depth]=(counts[record.depth] || 0)+1;return;
  }
  if(record.kind==='mask'){
   const roi=result.state?.rois?.[record.roiIndex];
   if(!roi || !/^\d+$/.test(record.z) || !result.selected.slices[Number(record.z)] || Object.hasOwn(roi.sliceMasks,record.z))throw new Error('Invalid study mask reference.');
   roi.sliceMasks[record.z]=record.mask;masks++;return;
  }
  if(record.kind==='end'){
   if(!counts.length || JSON.stringify(record.counts)!==JSON.stringify(counts) || record.masks!==masks)throw new Error('Incomplete study transfer.');
   ended=true;return;
  }
  throw new Error('Unknown study record.');
 };
 try{
  for(;;){const {value,done}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});let start=0,end:number;
   while((end=pending.indexOf('\n',start))!==-1){accept(pending.slice(start,end));start=end+1;}
   pending=pending.slice(start);if(pending.length>64*1024*1024)throw new Error('Study record exceeds the supported size.');
   if(done)break;
  }
  if(pending)accept(pending);if(!ended)throw new Error('Incomplete study transfer. Please reopen the study.');return result;
 }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
}
