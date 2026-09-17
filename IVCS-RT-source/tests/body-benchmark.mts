import {generateBodyMaskForSlice} from '../src/utils/contourEngine.ts';
import type {DicomSlice} from '../src/types/index.ts';
for(const [n,spacing] of [[512,1],[512,.5],[1024,.5]]){
  const slice={rows:n,cols:n,pixelSpacing:[spacing,spacing],huData:new Int16Array(n*n).fill(-1000)} as DicomSlice;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(((x-n*.5)/(n*.3))**2+((y-n*.45)/(n*.35))**2<1)slice.huData[y*n+x]=0;
  for(let i=0;i<3;i++)generateBodyMaskForSlice(slice);
  const times:number[]=[];
  for(let i=0;i<5;i++){const t=performance.now();generateBodyMaskForSlice(slice);times.push(performance.now()-t);}
  times.sort((a,b)=>a-b);console.log(JSON.stringify({rows:n,cols:n,spacingMm:spacing,medianMs:+times[2].toFixed(2)}));
}
