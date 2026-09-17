// Greedy boundary meshing: exact voxel faces, merged coplanar rectangles in physical millimetres.
export interface SurfaceInput {cols:number;rows:number;depth:number;spacing:number[];origin:number[];masks:Record<number,Uint8Array>;}
export function contourSurface({cols,rows,depth,spacing,origin,masks}:SurfaceInput){
 const dims=[cols,rows,depth],positions:number[]=[],normals:number[]=[];
 const min=[cols,rows,depth],max=[-1,-1,-1];
 for(const [key,mask] of Object.entries(masks)){const z=Number(key);if(z<0 || z>=depth)continue;for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%cols,y=Math.floor(i/cols);min[0]=Math.min(min[0],x);min[1]=Math.min(min[1],y);min[2]=Math.min(min[2],z);max[0]=Math.max(max[0],x);max[1]=Math.max(max[1],y);max[2]=Math.max(max[2],z);}}
 if(max[0]<0)return {positions:new Float32Array(),normals:new Float32Array()};
 const voxel=(p:number[])=>p.some((v,i)=>v<0 || v>=dims[i])?0:masks[p[2]]?.[p[1]*cols+p[0]]?1:0;
 for(let axis=0;axis<3;axis++){
  const u=(axis+1)%3,v=(axis+2)%3,w=max[u]-min[u]+1,h=max[v]-min[v]+1,face=new Int8Array(w*h);
  for(let d=min[axis]-1;d<=max[axis];d++){
   for(let j=0;j<h;j++)for(let i=0;i<w;i++){const p=[0,0,0];p[axis]=d;p[u]=min[u]+i;p[v]=min[v]+j;const a=voxel(p);p[axis]++;const b=voxel(p);face[j*w+i]=a===b?0:a?1:-1;}
   for(let j=0;j<h;j++)for(let i=0;i<w;){const sign=face[j*w+i];if(!sign){i++;continue;}let width=1,height=1;while(i+width<w && face[j*w+i+width]===sign)width++;
    outer:while(j+height<h){for(let k=0;k<width;k++)if(face[(j+height)*w+i+k]!==sign)break outer;height++;}
    const p=[0,0,0];p[axis]=d+.5;p[u]=min[u]+i-.5;p[v]=min[v]+j-.5;
    const q=p.slice(),r=p.slice(),s=p.slice();q[u]+=width;r[u]+=width;r[v]+=height;s[v]+=height;
    for(const point of sign>0?[p,q,r,p,r,s]:[p,r,q,p,s,r]){for(let a=0;a<3;a++){positions.push(origin[a]+point[a]*spacing[a]);normals.push(a===axis?sign:0);}}
    if(positions.length>12000000)throw new Error('Superficie demasiado compleja. Muestre menos estructuras en 3D.');
    for(let y=0;y<height;y++)face.fill(0,(j+y)*w+i,(j+y)*w+i+width);i+=width;
   }
  }
 }
 return {positions:new Float32Array(positions),normals:new Float32Array(normals)};
}
