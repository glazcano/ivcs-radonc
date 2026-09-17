import { performance } from 'node:perf_hooks';
import { strokeBrushLine, getMaskBoundingBox } from '../src/utils/contourEngine';

// CPU microbenchmark: stamp + refreshed bounds, not end-to-end browser frame rate.
for (const size of [512,1024]) {
  const mask=new Uint8Array(size*size), times:number[]=[];
  for(let i=0;i<360;i++) {
    const x0=20+(i*2)%(size-40), x1=Math.min(size-20,x0+2);
    const start=performance.now();
    strokeBrushLine(mask,size,size,x0,size/2,x1,size/2,5,1);
    getMaskBoundingBox(mask,size,size);
    const elapsed=performance.now()-start;
    if(i>=60) times.push(elapsed);
  }
  times.sort((a,b)=>a-b);
  console.log(`${size}x${size}: stamp + fresh bounds, median ${times[150].toFixed(3)} ms, p95 ${times[285].toFixed(3)} ms (${times.length} samples)`);
}
