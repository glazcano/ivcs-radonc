import {contourSurface} from '../utils/contourSurface';
self.onmessage=e=>{try{const meshes=e.data.items.map((r:any)=>({id:r.id,...contourSurface({...e.data.geometry,...r.geometry,masks:r.masks})}));(self as any).postMessage({meshes},meshes.flatMap((m:any)=>[m.positions.buffer,m.normals.buffer]));}catch(e){self.postMessage({error:(e as Error).message});}};
