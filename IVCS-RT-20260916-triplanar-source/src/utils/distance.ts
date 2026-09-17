/** Exact squared Euclidean distance on an anisotropic Cartesian grid. */
export function distanceSquared(features:Uint8Array,nx:number,ny:number,nz:number,spacing:[number,number,number]):Float64Array{
  const data=new Float64Array(features.length);for(let i=0;i<features.length;i++)data[i]=features[i]?0:1e20;
  const n=Math.max(nx,ny,nz),f=new Float64Array(n),out=new Float64Array(n),v=new Int32Array(n),cuts=new Float64Array(n+1);
  function line(length:number,weight:number){let k=0;v[0]=0;cuts[0]=-Infinity;cuts[1]=Infinity;
    for(let q=1;q<length;q++){let crossing=0;do{const p=v[k];crossing=((f[q]+weight*q*q)-(f[p]+weight*p*p))/(2*weight*(q-p));if(crossing<=cuts[k])k--;else break;}while(k>=0);k++;v[k]=q;cuts[k]=crossing;cuts[k+1]=Infinity;}
    k=0;for(let q=0;q<length;q++){while(cuts[k+1]<q)k++;out[q]=weight*(q-v[k])**2+f[v[k]];}
  }
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){const base=(z*ny+y)*nx;for(let x=0;x<nx;x++)f[x]=data[base+x];line(nx,spacing[0]**2);for(let x=0;x<nx;x++)data[base+x]=out[x];}
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){for(let y=0;y<ny;y++)f[y]=data[(z*ny+y)*nx+x];line(ny,spacing[1]**2);for(let y=0;y<ny;y++)data[(z*ny+y)*nx+x]=out[y];}
  if(nz>1)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){for(let z=0;z<nz;z++)f[z]=data[(z*ny+y)*nx+x];line(nz,spacing[2]**2);for(let z=0;z<nz;z++)data[(z*ny+y)*nx+x]=out[z];}
  return data;
}
