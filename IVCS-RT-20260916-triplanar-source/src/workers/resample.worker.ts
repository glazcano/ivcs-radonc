import {resampleAxial} from '../utils/axialResampling';
self.onmessage=async({data})=>{try{const result=await resampleAxial(data.series,percent=>self.postMessage({progress:percent}));delete result.sourceVolume;const transfer=result.slices.flatMap(s=>[s.huData.buffer,s.valid!.buffer]);self.postMessage({result},{transfer});}catch(e){self.postMessage({error:(e as Error).message});}};
