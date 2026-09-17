// One JSON record per image/mask avoids V8's maximum string length. Existing
// images.json.gz files remain readable; this changes only the HTTP transport.
export async function sendStudyStream(res,{selected,state,revision}){
 const metadata=volume=>{const {slices,sourceVolume,...rest}=volume;return {...rest,slices:[],...(sourceVolume?{sourceVolume:metadata(sourceVolume)}:{})};};
 res.type('application/x-ndjson');res.setHeader('Cache-Control','no-store');
 const send=async record=>{
  if(res.destroyed)throw new Error('Study transfer disconnected.');
  if(res.write(JSON.stringify(record)+'\n'))return;
  await new Promise((resolve,reject)=>{
   const cleanup=()=>{res.off('drain',drain);res.off('close',close);res.off('error',error);};
   const drain=()=>{cleanup();resolve();},close=()=>{cleanup();reject(new Error('Study transfer disconnected.'));},error=e=>{cleanup();reject(e);};
   res.once('drain',drain);res.once('close',close);res.once('error',error);
  });
 };
 await send({kind:'header',format:'ivcs-study-stream',version:1,selected:metadata(selected),state:state?{...state,rois:state.rois.map(roi=>({...roi,sliceMasks:{}}))}:null,revision});
 let volume=selected,depth=0;const counts=[];
 while(volume){counts.push(volume.slices.length);for(let index=0;index<volume.slices.length;index++)await send({kind:'slice',depth,index,slice:volume.slices[index]});volume=volume.sourceVolume;depth++;}
 let masks=0;
 for(const [roiIndex,roi] of (state?.rois || []).entries())for(const [z,mask] of Object.entries(roi.sliceMasks || {})){await send({kind:'mask',roiIndex,z,mask});masks++;}
 await send({kind:'end',counts,masks});res.end();
}
