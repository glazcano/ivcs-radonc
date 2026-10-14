/** Draw UI annotations in CSS pixels while retaining their image-space anchors. */
export function inCanvasScreenSpace(ctx:CanvasRenderingContext2D,draw:(point:(x:number,y:number)=>{x:number;y:number},imageScale:number)=>void){
 const transform=ctx.getTransform(),canvas=ctx.canvas;
 const sx=canvas.width/(canvas.clientWidth || canvas.width),sy=canvas.height/(canvas.clientHeight || canvas.height);
 const point=(x:number,y:number)=>({x:(transform.a*x+transform.c*y+transform.e)/sx,y:(transform.b*x+transform.d*y+transform.f)/sy});
 ctx.save();
 try{ctx.setTransform(sx,0,0,sy,0,0);draw(point,Math.hypot(transform.a/sx,transform.b/sy));}finally{ctx.restore();}
}
