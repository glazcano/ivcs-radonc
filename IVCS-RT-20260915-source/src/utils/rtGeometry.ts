import type {DicomSlice} from '../types';
export type Point=[number,number];
const area=(p:Point[])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
export function inside(p:Point,poly:Point[]):boolean {
  let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }return yes;
}
/** Trace voxel CELL edges. DICOM position identifies the centre of pixel (0,0). */
export function traceCellLoops(mask:Uint8Array,rows:number,cols:number):Point[][] {
  type Edge={a:Point;b:Point;d:number;used?:boolean};const edges:Edge[]=[],starts=new Map<string,Edge[]>();
  const add=(x:number,y:number,u:number,v:number,d:number)=>{const e:Edge={a:[x-.5,y-.5],b:[u-.5,v-.5],d};edges.push(e);const k=e.a.join(',');starts.set(k,[...(starts.get(k)||[]),e]);};
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(mask[y*cols+x]){
    if(y===0 || !mask[(y-1)*cols+x])add(x,y,x+1,y,0);
    if(x===cols-1 || !mask[y*cols+x+1])add(x+1,y,x+1,y+1,1);
    if(y===rows-1 || !mask[(y+1)*cols+x])add(x+1,y+1,x,y+1,2);
    if(x===0 || !mask[y*cols+x-1])add(x,y+1,x,y,3);
  }
  const loops:Point[][]=[];
  for(const first of edges)if(!first.used){let e=first;const loop:Point[]=[];
    for(let count=0;count<=edges.length;count++){
      e.used=true;loop.push(e.a);if(e.b[0]===first.a[0] && e.b[1]===first.a[1])break;
      const next=(starts.get(e.b.join(','))||[]).filter(v=>!v.used).sort((a,b)=>[1,0,3,2].indexOf((a.d-e.d+4)%4)-[1,0,3,2].indexOf((b.d-e.d+4)%4))[0];
      if(!next)throw new Error('No se pudo cerrar el borde de la máscara.');e=next;
    }
    const simple=loop.filter((p,i)=>{const a=loop[(i+loop.length-1)%loop.length],b=loop[(i+1)%loop.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);});
    if(simple.length>=3)loops.push(simple);
  }return loops;
}
export function rasterizeLoops(loops:Point[][],rows:number,cols:number,xor=true):Uint8Array {
  const mask=new Uint8Array(rows*cols);
  for(const poly of loops){if(poly.length<3)continue;
    const minY=Math.max(0,Math.ceil(Math.min(...poly.map(p=>p[1])))),maxY=Math.min(rows-1,Math.floor(Math.max(...poly.map(p=>p[1]))));
    for(let y=minY;y<=maxY;y++){
      const crossings:number[]=[];
      for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if((a[1]>y)!==(b[1]>y))crossings.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2)for(let x=Math.max(0,Math.ceil(crossings[i]));x<=Math.min(cols-1,Math.ceil(crossings[i+1])-1);x++){const n=y*cols+x;mask[n]=xor?mask[n]^1:1;}
    }
  }return mask;
}
function simplifyClosed(poly:Point[],tolerance:number,spacing:[number,number]):Point[]{
  if(tolerance<=0)return poly;
  const out=[...poly];const original=poly;let changed=true;
  while(changed && out.length>3){changed=false;for(let i=0;i<out.length;i++){
    const a=out[(i+out.length-1)%out.length],p=out[i],b=out[(i+1)%out.length];
    const dx=(b[0]-a[0])*spacing[1],dy=(b[1]-a[1])*spacing[0],px=(p[0]-a[0])*spacing[1],py=(p[1]-a[1])*spacing[0];
    const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy || 1)));
    let bounded=true;
    const ia=original.indexOf(a),ib=original.indexOf(b);
    for(let j=(ia+1)%original.length;j!==ib;j=(j+1)%original.length){const q=original[j],qx=(q[0]-a[0])*spacing[1],qy=(q[1]-a[1])*spacing[0],u=Math.max(0,Math.min(1,(qx*dx+qy*dy)/(dx*dx+dy*dy || 1)));if(Math.hypot(qx-u*dx,qy-u*dy)>tolerance){bounded=false;break;}}
    if(bounded && Math.hypot(px-t*dx,py-t*dy)<=tolerance){out.splice(i,1);changed=true;break;}
  }}return out;
}
/** Keyhole bridges are traversed in both directions and have zero area. */
export function joinKeyholes(loops:Point[][]):Point[][] {
  const outer=loops.filter(p=>area(p)>0).map(p=>[...p]),holes=loops.filter(p=>area(p)<0);
  for(const hole of holes){
    const owners=outer.map((p,i)=>({p,i})).filter(({p})=>inside(hole[0],p)).sort((a,b)=>Math.abs(area(a.p))-Math.abs(area(b.p)));
    if(!owners.length)throw new Error('Hueco sin contorno externo.');
    const {p,i}=owners[0];let best=Infinity,oi=0,hi=0;
    for(let a=0;a<p.length;a++)for(let b=0;b<hole.length;b++){const d=Math.hypot(p[a][0]-hole[b][0],p[a][1]-hole[b][1]);if(d<best){best=d;oi=a;hi=b;}}
    const cycle=[...hole.slice(hi),...hole.slice(0,hi),hole[hi]];
    outer[i]=[...p.slice(0,oi+1),...cycle,p[oi],...p.slice(oi+1)];
  }return outer;
}
export function exportLoops(mask:Uint8Array,slice:DicomSlice,tolerance=0,minArea=0,mode:'keyhole'|'xor'='keyhole'){
  const original=traceCellLoops(mask,slice.rows,slice.cols),spacing=slice.pixelSpacing;
  // Filter entire connected components, never independently fill their holes.
  const components=joinKeyholes(original),kept=components.filter(p=>Math.abs(area(p))*spacing[0]*spacing[1]>=minArea);
  let loops=kept;
  if(mode==='xor')loops=traceCellLoops(rasterizeLoops(kept,slice.rows,slice.cols,false),slice.rows,slice.cols);
  const candidate=loops.map(p=>simplifyClosed(p,tolerance,spacing));
  const exact=rasterizeLoops(loops,slice.rows,slice.cols,mode==='xor'),simplified=rasterizeLoops(candidate,slice.rows,slice.cols,mode==='xor');
  // Simplification may not change a single voxel or destroy topology.
  if(exact.every((v,i)=>v===simplified[i]))loops=candidate;
  return {loops,removedComponents:components.length-kept.length,mask:exact};
}
