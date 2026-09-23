import {cleanupVolume,CleanupInput} from '../utils/volumeCleanup';
self.onmessage=(event:MessageEvent<CleanupInput>)=>{
 try{const result=cleanupVolume(event.data,progress=>self.postMessage({progress}));(self as any).postMessage({result},Object.values(result.masks).map(m=>m.buffer));}
 catch(error){self.postMessage({error:(error as Error).message});}
};
