import type {RegistrationState,DicomSeries} from '../types';

export function secondaryDisplay(study:DicomSeries){
  const s=study.slices[Math.floor(study.slices.length/2)];
  return {secondaryWindowCenter:s.windowCenter,secondaryWindowWidth:Math.max(.001,s.windowWidth),secondaryColorMap:'grayscale' as const};
}

/** Draw in reference pixel coordinates; outside the secondary support stays transparent. */
export function drawFusion(ctx:CanvasRenderingContext2D,layer:HTMLCanvasElement,r:Pick<RegistrationState,'fusionMode'|'fusionOpacity'|'splitPosition'|'checkerboardSize'>){
  const w=layer.width,h=layer.height;ctx.save();
  if(r.fusionMode==='blend')ctx.globalAlpha=r.fusionOpacity;
  if(r.fusionMode==='difference')ctx.globalCompositeOperation='difference';
  if(r.fusionMode==='checkerboard'){
    const size=Math.max(1,r.checkerboardSize);ctx.beginPath();
    for(let y=0;y<h;y+=size)for(let x=0;x<w;x+=size)if((Math.floor(x/size)+Math.floor(y/size))%2===0)ctx.rect(x,y,Math.min(size,w-x),Math.min(size,h-y));
    ctx.clip();
  }
  if(r.fusionMode.startsWith('split_')){
    const p=Math.max(0,Math.min(1,r.splitPosition));ctx.beginPath();
    if(r.fusionMode==='split_horizontal')ctx.rect(w*p,0,w*(1-p),h);else ctx.rect(0,h*p,w,h*(1-p));ctx.clip();
  }
  ctx.drawImage(layer,0,0);ctx.restore();
}
