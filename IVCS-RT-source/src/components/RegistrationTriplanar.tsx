import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {ImageStudy,RegistrationState,RegistrationTransform,MprCoordinates,RegistrationVoi,DicomSlice} from '../types';
import {referencePlane,ImagePlane} from '../utils/panelPlane';
import {resamplePlane,Vec3} from '../utils/rigid3d';
import {dragTransform} from '../utils/registrationGeometry';
import {patientPoint} from '../utils/geometry';
import {renderSliceToCanvas} from '../utils/registrationEngine';
import {drawFusion} from '../utils/fusionDisplay';
import {tr} from '../i18n';
interface Props {key?:string;reference:ImageStudy;secondary:ImageStudy;transform:RegistrationTransform;display:RegistrationState;busy:boolean;onTransform?:(t:RegistrationTransform)=>void;onVoi:(v:RegistrationVoi)=>void;initialZ:number;}
const names={axial:'Axial',coronal:'Coronal',sagittal:'Sagital'};
/** Bounded preview raster only; original volumes and transforms retain full precision. */
function preview(s:DicomSlice){
 const factor=Math.max(1,Math.max(s.rows,s.cols)/320),cols=Math.ceil(s.cols/factor),rows=Math.ceil(s.rows/factor),sx=s.cols/cols,sy=s.rows/rows;
 if(factor===1)return s;
 const data=new Float32Array(cols*rows),valid=new Uint8Array(data.length);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=Math.min(s.rows-1,Math.floor((y+.5)*sy))*s.cols+Math.min(s.cols-1,Math.floor((x+.5)*sx));data[y*cols+x]=s.huData[i];valid[y*cols+x]=s.valid?s.valid[i]:1;}
 return {...s,cols,rows,huData:data,valid,pixelType:'f32' as const,pixelSpacing:[s.pixelSpacing[0]*sy,s.pixelSpacing[1]*sx] as [number,number],imagePositionPatient:patientPoint(s,(sx-1)/2,(sy-1)/2)};
}
export function RegistrationTriplanar(p:Props){
 const [layout,setLayout]=useState('oneplus2'),[tool,setTool]=useState('translate'),[fraction,setFraction]=useState(.62);
 const s=p.reference.slices[0],depth=p.reference.slices.length;
 const [coords,setCoords]=useState<MprCoordinates>({x:Math.floor(s.cols/2),y:Math.floor(s.rows/2),z:Math.min(depth-1,p.initialZ)});
 const voi=p.display.voi;
 return <div className="space-y-2" data-testid="registration-triplanar"><div className="flex flex-wrap gap-3 text-xs items-center">
 <label>{tr('Distribución')} <select aria-label={tr('Distribución de corregistro')} className="bg-zinc-800 p-1" value={layout} onChange={e=>setLayout(e.target.value)}><option value="row">{tr('Tres planos en fila')}</option><option value="oneplus2">1+2</option></select></label>
 <label>{tr('Acción al arrastrar')} <select aria-label={tr('Acción al arrastrar')} className="bg-zinc-800 p-1" value={tool} onChange={e=>setTool(e.target.value)}><option value="translate">{tr('Trasladar')}</option><option value="rotate">{tr('Rotar')}</option><option value="navigate">{tr('Navegar')}</option><option value="voi">{tr('Dibujar VOI')}</option></select></label>
 <span>{tr('Rueda: cortes · Mayús: rotar · Ctrl: navegar · centro de giro: cruceta')}</span>
 </div>
 <div className="grid gap-1 h-[48vh] min-h-80" style={{gridTemplateColumns:layout==='row'?'repeat(3,minmax(0,1fr))':`minmax(0,${fraction}fr) 6px minmax(0,${1-fraction}fr)`,gridTemplateRows:layout==='row'?'1fr':'1fr 1fr'}}>
 {(['axial','coronal','sagittal'] as ImagePlane[]).map((plane,i)=><Plane key={plane} {...p} plane={plane} tool={tool} coords={coords} onNavigate={setCoords} style={layout==='row'?{}:i===0?{gridColumn:1,gridRow:'1 / 3'}:{gridColumn:3,gridRow:i}}/>)}
 {layout==='oneplus2' && <div role="separator" aria-label={tr('Ancho del panel principal')} tabIndex={0} aria-orientation="vertical" aria-valuemin={30} aria-valuemax={80} aria-valuenow={Math.round(fraction*100)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setFraction(f=>Math.max(.3,Math.min(.8,f+(e.key==='ArrowRight' ? .02 : -.02))));}}} className="bg-zinc-700 cursor-col-resize touch-none" style={{gridColumn:2,gridRow:'1 / 3'}} onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const b=e.currentTarget.parentElement!.getBoundingClientRect();setFraction(Math.max(.3,Math.min(.8,(e.clientX-b.left)/b.width)));}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}/>}
 </div>
 <div className="flex flex-wrap gap-2 text-xs items-center"><label><input type="checkbox" disabled={p.busy} checked={voi.enabled} onChange={e=>p.onVoi({...voi,enabled:e.target.checked})}/> {tr('Priorizar VOI en automático')}</label>
 {([['minX','maxX',s.cols,'X'],['minY','maxY',s.rows,'Y'],['minSlice','maxSlice',depth,'Z']] as const).map(([a,b,limit,label])=><label key={a}>{label} <input aria-label={'VOI '+label+' min'} disabled={p.busy} type="number" min={0} max={limit-1} className="w-16 bg-zinc-800" value={voi[a]} onChange={e=>p.onVoi({...voi,[a]:Math.max(0,Math.min(voi[b],Math.floor(Number(e.target.value))))})}/> – <input aria-label={'VOI '+label+' max'} disabled={p.busy} type="number" min={0} max={limit-1} className="w-16 bg-zinc-800" value={voi[b]} onChange={e=>p.onVoi({...voi,[b]:Math.min(limit-1,Math.max(voi[a],Math.floor(Number(e.target.value))))})}/></label>)}
 <button disabled={p.busy} className="border rounded px-2" onClick={()=>p.onVoi({enabled:false,minX:0,maxX:s.cols-1,minY:0,maxY:s.rows-1,minSlice:0,maxSlice:depth-1})}>{tr('Todo el volumen')}</button></div>
 </div>;
}
function Plane(p:Props & {plane:ImagePlane;tool:string;coords:MprCoordinates;onNavigate:(v:MprCoordinates)=>void;style:React.CSSProperties}){
 const {reference,secondary,transform,display,plane,coords}=p,canvas=useRef<HTMLCanvasElement>(null),drag=useRef<{x:number;y:number;t:RegistrationTransform;mode:string;pivot:Vec3;start:MprCoordinates}|null>(null);
 useEffect(()=>{const c=canvas.current;if(!c)return;const stop=(e:WheelEvent)=>e.preventDefault();c.addEventListener('wheel',stop,{passive:false});return()=>c.removeEventListener('wheel',stop);},[]);
 const frame=useMemo(()=>referencePlane(reference,coords,plane),[reference,coords,plane]),small=useMemo(()=>preview(frame),[frame]);
 const key=plane==='axial'?'z':plane==='coronal'?'y':'x',limit=key==='z'?reference.slices.length:key==='y'?reference.slices[0].rows:reference.slices[0].cols;
 const height=reference.slices.length;
 const point=(x:number,y:number)=>({...coords,...(plane==='axial'?{x,y}:plane==='coronal'?{x,z:height-1-y}:{y:x,z:height-1-y})});
 useEffect(()=>{const c=canvas.current;if(!c)return;const id=requestAnimationFrame(()=>{
 c.width=small.cols;c.height=Math.max(1,Math.round(small.rows*small.pixelSpacing[0]/small.pixelSpacing[1]));const ctx=c.getContext('2d')!;ctx.scale(c.width/small.cols,c.height/small.rows);
 ctx.drawImage(renderSliceToCanvas(small,frame.windowCenter,frame.windowWidth,'grayscale'),0,0);
 drawFusion(ctx,renderSliceToCanvas(resamplePlane(small,secondary,transform),display.secondaryWindowCenter,display.secondaryWindowWidth,display.secondaryColorMap),display);
 ctx.setTransform(c.width/frame.cols,0,0,c.height/frame.rows,0,0);ctx.lineWidth=Math.max(frame.cols/c.width,frame.rows/c.height);
 const x=plane==='sagittal'?coords.y:coords.x,y=plane==='axial'?coords.y:height-1-coords.z;
 ctx.strokeStyle='#22d3ee';ctx.beginPath();ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,frame.rows);ctx.moveTo(0,y+.5);ctx.lineTo(frame.cols,y+.5);ctx.stroke();
 const v=display.voi;if(v.enabled){const min=plane==='sagittal'?v.minY:v.minX,max=plane==='sagittal'?v.maxY:v.maxX,top=plane==='axial'?v.minY:height-1-v.maxSlice,bottom=plane==='axial'?v.maxY:height-1-v.minSlice,inside=plane==='axial'?coords.z>=v.minSlice&&coords.z<=v.maxSlice:plane==='coronal'?coords.y>=v.minY&&coords.y<=v.maxY:coords.x>=v.minX&&coords.x<=v.maxX;
 ctx.strokeStyle=inside?'#fbbf24':'#a16207';ctx.setLineDash(inside?[]:[4,4]);ctx.strokeRect(min,top,max-min+1,bottom-top+1);}
 });return()=>cancelAnimationFrame(id);},[small,frame,secondary,transform,display,coords,plane,height]);
 const position=(e:React.PointerEvent<HTMLCanvasElement>)=>{const b=e.currentTarget.getBoundingClientRect(),ratio=e.currentTarget.width/e.currentTarget.height,w=Math.min(b.width,b.height*ratio),h=w/ratio;return {x:(e.clientX-b.left-(b.width-w)/2)/w*frame.cols-.5,y:(e.clientY-b.top-(b.height-h)/2)/h*frame.rows-.5};};
 const navigate=(x:number,y:number)=>{const q=point(Math.max(0,Math.min(frame.cols-1,Math.round(x))),Math.max(0,Math.min(frame.rows-1,Math.round(y))));p.onNavigate(q);return q;};
 return <div style={p.style} className="flex flex-col min-w-0 min-h-0 bg-black border border-zinc-700"><div className="text-xs px-2">{tr(names[plane])} · {coords[key]+1}/{limit}</div>
 <canvas aria-label={tr('Corregistro')+' '+tr(names[plane])} data-testid={'registration-'+plane} ref={canvas} className="flex-1 min-h-0 w-full object-contain touch-none cursor-crosshair" onWheel={e=>{e.stopPropagation();p.onNavigate({...coords,[key]:Math.max(0,Math.min(limit-1,coords[key]+Math.sign(e.deltaY)))});}}
 onPointerDown={e=>{if(e.button!==0)return;const {x,y}=position(e);if(x<-.5||y<-.5||x>frame.cols-.5||y>frame.rows-.5)return;const mode=e.ctrlKey?'navigate':e.shiftKey?'rotate':p.tool;if((mode==='voi'&&p.busy)||(['translate','rotate'].includes(mode)&&!p.onTransform))return;e.currentTarget.setPointerCapture(e.pointerId);const pivot=patientPoint(reference.slices[coords.z],coords.x,coords.y);drag.current={x,y,t:transform,mode,pivot,start:point(Math.round(x),Math.round(y))};if(mode==='navigate')navigate(x,y);}}
 onPointerMove={e=>{const d=drag.current;if(!d)return;const {x,y}=position(e);if(d.mode==='navigate'){navigate(x,y);return;}if(d.mode==='voi'){const a=d.start,b=point(Math.max(0,Math.min(frame.cols-1,Math.round(x))),Math.max(0,Math.min(frame.rows-1,Math.round(y)))),v={...display.voi,enabled:true};if(plane!=='sagittal'){v.minX=Math.min(a.x,b.x);v.maxX=Math.max(a.x,b.x);}if(plane!=='coronal'){v.minY=Math.min(a.y,b.y);v.maxY=Math.max(a.y,b.y);}if(plane!=='axial'){v.minSlice=Math.min(a.z,b.z);v.maxSlice=Math.max(a.z,b.z);}p.onVoi(v);return;}
 const cx=plane==='sagittal'?coords.y:coords.x,cy=plane==='axial'?coords.y:height-1-coords.z;
 const angle=d.mode==='rotate'?Math.atan2((y-cy)*frame.pixelSpacing[0],(x-cx)*frame.pixelSpacing[1])-Math.atan2((d.y-cy)*frame.pixelSpacing[0],(d.x-cx)*frame.pixelSpacing[1]):undefined;
 p.onTransform?.(dragTransform(d.t,frame,(x-d.x)*frame.pixelSpacing[1],(y-d.y)*frame.pixelSpacing[0],angle,d.pivot));}}
 onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onLostPointerCapture={()=>drag.current=null}/>
 <input aria-label={tr('Corte')+' '+tr(names[plane])} type="range" min={0} max={limit-1} value={coords[key]} onChange={e=>p.onNavigate({...coords,[key]:Number(e.target.value)})}/></div>;
}
