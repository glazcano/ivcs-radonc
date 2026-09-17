import {decompress} from '../utils/dicomCodecs';
self.onmessage=async(e:MessageEvent<Uint8Array>)=>{
 try{const bytes=await decompress(e.data);(self as unknown as {postMessage:(value:unknown,transfer:Transferable[])=>void}).postMessage({bytes},[bytes.buffer as ArrayBuffer]);}
 catch(error){self.postMessage({error:(error as Error).message});}
};
