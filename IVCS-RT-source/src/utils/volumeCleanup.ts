import {nativeMaskIndex} from './segmentationGrid';
export interface CleanupInput {
  validScale?:1|2;
  cols:number;rows:number;depth:number;spacing:[number,number,number];
  masks:Record<number,Uint8Array>;valid?:Record<number,Uint8Array>;
  method:'none'|'median'|'opening'|'closing';radiusMm:number;
  minComponentMm3:number;fillHoles:boolean;
}
export interface CleanupResult {masks:Record<number,Uint8Array>;before:number;after:number;added:number;removed:number;removedComponents:number;voxelMm3:number;}

/** Binary 3D morphology in physical millimetres, on a padded ROI bounding box.
 * Median/opening/closing follow standard binary mathematical morphology (Slicer Segment Editor).
 * Components use face (6) connectivity; enclosed background uses 26 connectivity to
 * avoid filling cavities connected to the exterior through a diagonal opening.
 */
export function cleanupVolume(p:CleanupInput,progress:(n:number)=>void=()=>{}):CleanupResult {
  const {cols,rows,depth,spacing}=p;
  if(![cols,rows,depth].every(n=>Number.isInteger(n)&&n>0)||!spacing.every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(p.radiusMm)||p.radiusMm<0||p.radiusMm>10||!Number.isFinite(p.minComponentMm3)||p.minComponentMm3<0)throw new Error('Parámetros de limpieza no válidos.');
  let lo=[cols,rows,depth],hi=[-1,-1,-1],before=0;
  for(const [key,mask] of Object.entries(p.masks)){
    const z=Number(key);if(!Number.isInteger(z)||z<0||z>=depth||mask.length!==cols*rows)throw new Error('Dimensiones de máscara no válidas.');
    for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%cols,y=Math.floor(i/cols);before++;lo=[Math.min(lo[0],x),Math.min(lo[1],y),Math.min(lo[2],z)];hi=[Math.max(hi[0],x),Math.max(hi[1],y),Math.max(hi[2],z)];}
  }
  const result:CleanupResult={masks:{},before,after:0,added:0,removed:0,removedComponents:0,voxelMm3:spacing[0]*spacing[1]*spacing[2]};
  if(!before)return result;
  const radius=spacing.map(s=>Math.ceil(p.radiusMm/s));
  // Two morphological passes need two radii of context, plus an exterior layer.
  lo=lo.map((v,a)=>Math.max(0,v-2*radius[a]-1));hi=hi.map((v,a)=>Math.min([cols,rows,depth][a]-1,v+2*radius[a]+1));
  const [w,h,d]=hi.map((v,a)=>v-lo[a]+1),wh=w*h,n=wh*d;
  if(n>64*1024*1024)throw new Error('La región requiere demasiada memoria para la limpieza local.');
  let volume=new Uint8Array(n);const allowed=new Uint8Array(n);
  const globalIndex=(i:number)=>{const z=Math.floor(i/wh),y=Math.floor(i%wh/w),x=i%w;return [z+lo[2],(y+lo[1])*cols+x+lo[0]];};
  for(let i=0;i<n;i++){const [z,j]=globalIndex(i);allowed[i]=p.valid?.[z]?.[nativeMaskIndex(j,cols/(p.validScale||1),p.validScale||1)]===0?0:1;volume[i]=allowed[i]&&p.masks[z]?.[j]?1:0;}
  const offsets:number[][]=[];
  if(p.method!=='none'){
    if(radius.reduce((n,r)=>n*(2*r+1),1)>1000000)throw new Error('Reduzca el radio de suavizado para esta resolución.');
    for(let z=-radius[2];z<=radius[2];z++)for(let y=-radius[1];y<=radius[1];y++)for(let x=-radius[0];x<=radius[0];x++)if((x*spacing[0])**2+(y*spacing[1])**2+(z*spacing[2])**2<=p.radiusMm**2+1e-9)offsets.push([x,y,z]);
    if(offsets.length>4096)throw new Error('Reduzca el radio de suavizado para esta resolución.');
  }
  const filter=(kind:'median'|'dilate'|'erode',base:number)=>{
    const out=new Uint8Array(n),threshold=kind==='median'?Math.floor(offsets.length/2)+1:kind==='dilate'?1:offsets.length;
    for(let z=0;z<d;z++){progress(base+z/d*25);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=z*wh+y*w+x;if(!allowed[i])continue;let count=0;
      for(let k=0;k<offsets.length;k++){const [dx,dy,dz]=offsets[k],xx=x+dx,yy=y+dy,zz=z+dz;if(xx>=0&&xx<w&&yy>=0&&yy<h&&zz>=0&&zz<d)count+=volume[zz*wh+yy*w+xx];if(count>=threshold){out[i]=1;break;}if(count+offsets.length-k-1<threshold)break;}
    }}volume=out;
  };
  if(p.method==='median')filter('median',0);
  if(p.method==='opening'){filter('erode',0);filter('dilate',25);}
  if(p.method==='closing'){
    filter('dilate',0);filter('erode',25);
    // Closing is extensive, including structures touching the acquisition boundary.
    for(let i=0;i<n;i++){const [z,j]=globalIndex(i);if(allowed[i]&&p.masks[z]?.[j])volume[i]=1;}
  }
  // One queue, reused for each component. No per-voxel JS objects or recursion.
  if(p.minComponentMm3>0||p.fillHoles){
    const queue=new Uint32Array(n),seen=new Uint8Array(n);
    const neighbours=(i:number,diagonal:boolean,visit:(j:number)=>void)=>{const x=i%w,y=Math.floor(i%wh/w),z=Math.floor(i/wh);
      if(!diagonal){if(x)visit(i-1);if(x+1<w)visit(i+1);if(y)visit(i-w);if(y+1<h)visit(i+w);if(z)visit(i-wh);if(z+1<d)visit(i+wh);return;}
      for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy||dz)&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&z+dz>=0&&z+dz<d)visit(i+dx+dy*w+dz*wh);
    };
    if(p.minComponentMm3>0)for(let i=0;i<n;i++)if(volume[i]&&!seen[i]){
      let head=0,tail=1;queue[0]=i;seen[i]=1;
      while(head<tail)neighbours(queue[head++],false,j=>{if(volume[j]&&!seen[j]){seen[j]=1;queue[tail++]=j;}});
      if(tail*result.voxelMm3<p.minComponentMm3){result.removedComponents++;for(let k=0;k<tail;k++)volume[queue[k]]=0;}
    }
    progress(70);
    if(p.fillHoles){
      seen.fill(0);let head=0,tail=0;
      for(let i=0;i<n;i++){const x=i%w,y=Math.floor(i%wh/w),z=Math.floor(i/wh);if(!volume[i]&&(!allowed[i]||x===0||x===w-1||y===0||y===h-1||z===0||z===d-1)){seen[i]=1;queue[tail++]=i;}}
      while(head<tail)neighbours(queue[head++],true,j=>{if(!volume[j]&&!seen[j]){seen[j]=1;queue[tail++]=j;}});
      for(let i=0;i<n;i++)if(!volume[i]&&!seen[i]&&allowed[i])volume[i]=1;
    }
  }
  for(let i=0;i<n;i++){
    const [z,j]=globalIndex(i),old=!!p.masks[z]?.[j],value=volume[i];
    if(value){result.masks[z]??=new Uint8Array(cols*rows);result.masks[z][j]=1;result.after++;if(!old)result.added++;}else if(old)result.removed++;
  }
  progress(100);return result;
}
