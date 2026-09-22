import type {Session} from './session';
import {validateSessionObject,parseSession} from './session';
const CHUNK=256*1024,MAX_RECORD=2*1024*1024,MAX_BYTES=2*1024*1024*1024;
/** Compact metadata plus bounded binary chunks. The reference volume is stored once. */
export function* sessionRecords(session:Session):Generator<string>{
 const arrays:Array<Int16Array|Float32Array|Uint8Array>=[];
 const ids=new Set(session.studies.map(s=>s.id));
 const reference=session.studies.find(s=>s.id===session.registrationState.referenceStudyId);
 if(!reference)throw new Error('Missing session reference');
 const root={...session,series:null,registrationState:{...session.registrationState,secondaryStudyId:ids.has(session.registrationState.secondaryStudyId)?session.registrationState.secondaryStudyId:reference.id,transforms:Object.fromEntries(Object.entries(session.registrationState.transforms).filter(([id])=>ids.has(id)))}};
 const metadata=JSON.stringify(root,(_,v)=>{if(v instanceof Int16Array || v instanceof Float32Array || v instanceof Uint8Array){const id=arrays.length;arrays.push(v);return {$binary:id,type:v instanceof Int16Array?'i16':v instanceof Float32Array?'f32':'u8',bytes:v.byteLength};}return v;});
 if(metadata.length>MAX_RECORD)throw new Error('Session metadata too large');
 yield JSON.stringify({format:'ivcs-session-stream',version:1,metadata:JSON.parse(metadata)})+'\n';
 for(let id=0;id<arrays.length;id++){
  const array=arrays[id],bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
  for(let offset=0;offset<bytes.length;offset+=CHUNK){let binary='';const chunk=bytes.subarray(offset,offset+CHUNK);for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));yield JSON.stringify({id,offset,data:btoa(binary)})+'\n';}
 }
 yield JSON.stringify({end:true,arrays:arrays.length})+'\n';
}
export async function readSessionFile(file:Blob):Promise<Session>{
 if(file.size>MAX_BYTES)throw new Error('Session exceeds the supported 2 GiB transfer limit.');
 const prefix=await file.slice(0,80).text();
 if(!prefix.includes('ivcs-session-stream')){if(file.size>128*1024*1024)throw new Error('Legacy JSON exceeds 128 MiB; export the case using the streamed session format.');return parseSession(await file.text());}
 const arrays:Uint8Array[]=[],offsets:number[]=[];let root:any,ended=false,total=0;
 const accept=(line:string)=>{
  if(ended)throw new Error('Data after session end');
  const record=JSON.parse(line,(_,v)=>{
   if(v && Object.hasOwn(v,'$binary')){
    if(v.$binary!==arrays.length || !['i16','f32','u8'].includes(v.type) || !Number.isSafeInteger(v.bytes) || v.bytes<0 || v.bytes%(v.type==='f32'?4:v.type==='i16'?2:1))throw new Error('Invalid binary declaration');
    total+=v.bytes;if(total>MAX_BYTES || total>file.size)throw new Error('Session exceeds memory limit or declared data size');
    const buffer=new ArrayBuffer(v.bytes);arrays.push(new Uint8Array(buffer));offsets.push(0);return v.type==='i16'?new Int16Array(buffer):v.type==='f32'?new Float32Array(buffer):new Uint8Array(buffer);
   }return v;
  });
  if(!root){if(record.format!=='ivcs-session-stream' || record.version!==1 || !record.metadata)throw new Error('Unsupported session');root=record.metadata;return;}
  if(record.end){if(record.arrays!==arrays.length || offsets.some((v,i)=>v!==arrays[i].length))throw new Error('Incomplete session');ended=true;return;}
  const array=arrays[record.id];if(!array || record.offset!==offsets[record.id] || typeof record.data!=='string')throw new Error('Invalid session chunk');
  const data=atob(record.data);if(data.length>CHUNK || record.offset+data.length>array.length)throw new Error('Invalid session chunk size');
  for(let i=0;i<data.length;i++)array[record.offset+i]=data.charCodeAt(i);offsets[record.id]+=data.length;
 };
 const reader=file.stream().getReader(),decoder=new TextDecoder();let pending='';
 try{for(;;){const {value,done}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});let end;while((end=pending.indexOf('\n'))>=0){if(end>MAX_RECORD)throw new Error('Session record too large');accept(pending.slice(0,end));pending=pending.slice(end+1);}if(pending.length>MAX_RECORD)throw new Error('Session record too large');if(done)break;}if(pending)accept(pending);if(!ended)throw new Error('Incomplete session');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 root.series=root.studies?.find((s:any)=>s.id===root.registrationState?.referenceStudyId);
 return validateSessionObject(root);
}
/** Disk writer on supporting browsers; bounded Blob fallback elsewhere. */
export async function saveChunks(name:string,chunks:Iterable<string|Uint8Array>|AsyncIterable<string|Uint8Array>){
 const picker=(globalThis as any).showSaveFilePicker;
 if(picker){const handle=await picker({suggestedName:name}),writer=await handle.createWritable();try{for await(const chunk of chunks)await writer.write(chunk);await writer.close();}catch(e){await writer.abort();throw e;}return;}
 const parts:BlobPart[]=[];let size=0;for await(const chunk of chunks){size+=typeof chunk==='string'?new TextEncoder().encode(chunk).length:chunk.byteLength;if(size>256*1024*1024)throw new Error('This browser needs streaming file saving for exports over 256 MiB. Use a browser with File System Access support.');parts.push(chunk as BlobPart);}
 const url=URL.createObjectURL(new Blob(parts)),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
