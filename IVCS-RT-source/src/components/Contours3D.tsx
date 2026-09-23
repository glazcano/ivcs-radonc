import {maskGeometry,maskScale} from '../utils/segmentationGrid';
import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {TrackballControls} from 'three/addons/controls/TrackballControls.js';
import type {DicomSeries,StructureRoi} from '../types';
import {voxelDepth} from '../utils/geometry';
import {tr} from '../i18n';
import {ContourCompositor} from '../utils/contourCompositor';
export default function Contours3D({series,rois,activeRoiId}:{series:DicomSeries;rois:StructureRoi[];activeRoiId?:string}){
 const host=useRef<HTMLDivElement>(null),sceneRef=useRef<any>(null),[onlyActive,setOnlyActive]=useState(false),[opacity,setOpacity]=useState(.8),[busy,setBusy]=useState(false),[error,setError]=useState(''),[visible,setVisible]=useState(!document.hidden);
 const relevant=rois.filter(r=>r.visible && (!onlyActive || r.id===activeRoiId));const latest=useRef(relevant);latest.current=relevant;const opacityRef=useRef(opacity);opacityRef.current=opacity;
 useEffect(()=>{const update=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 useEffect(()=>{
  const el=host.current!;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setError(tr('WebGL no disponible para la vista 3D.'));return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));el.appendChild(renderer.domElement);renderer.domElement.dataset.testid='contours-3d-canvas';
  const scene=new THREE.Scene();scene.background=new THREE.Color('#080c14');const camera=new THREE.PerspectiveCamera(40,1,.1,100000);camera.up.set(0,0,1);
  const controls=new TrackballControls(camera,renderer.domElement);controls.staticMoving=true;controls.rotateSpeed=3;controls.zoomSpeed=1.2;controls.keys=['','',''];
  scene.add(new THREE.AmbientLight(0xffffff,1.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(1,-1,2);scene.add(light);const meshes=new THREE.Group();scene.add(meshes);
  const compositor=new ContourCompositor(renderer);
  let raf=0,disposed=false;const invalidate=()=>{if(!disposed && !document.hidden && !raf)raf=requestAnimationFrame(()=>{raf=0;controls.update();compositor.render(scene,camera,meshes,opacityRef.current);renderer.domElement.dataset.frames=String(Number(renderer.domElement.dataset.frames || 0)+1);});};
  const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w || !h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();controls.handleResize();invalidate();};
  controls.addEventListener('change',invalidate);for(const name of ['pointermove','pointerdown','pointerup','wheel'])renderer.domElement.addEventListener(name,invalidate);
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const fit=()=>{const bounds=new THREE.Box3().setFromObject(meshes);if(bounds.isEmpty())return;const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()).length();controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,-1,.6).normalize().multiplyScalar(Math.max(size,1)*1.8));camera.up.set(0,0,1);camera.near=Math.max(.01,size/10000);camera.far=Math.max(10000,size*30);camera.updateProjectionMatrix();controls.update();invalidate();};
  sceneRef.current={scene,meshes,renderer,camera,controls,invalidate,fit,hasFit:false};
  return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();for(const name of ['pointermove','pointerdown','pointerup','wheel'])renderer.domElement.removeEventListener(name,invalidate);meshes.children.forEach((m:any)=>{m.geometry.dispose();m.material.dispose();});compositor.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();sceneRef.current=null;};
 },[series]);
 useEffect(()=>{
  if(!visible || !sceneRef.current)return;let worker:Worker|undefined,cancelled=false;setBusy(true);setError('');
  const timer=setTimeout(()=>{
   const s=series.slices[0];worker=new Worker(new URL('../workers/surface.worker.ts',import.meta.url),{type:'module'});
   worker.onmessage=e=>{if(cancelled)return;setBusy(false);if(e.data.error){setError(e.data.error);return;}const state=sceneRef.current;if(!state)return;
    for(const child of [...state.meshes.children]){child.geometry.dispose();child.material.dispose();state.meshes.remove(child);}
    for(const m of e.data.meshes){if(!m.positions.length)continue;const roi=latest.current.find(r=>r.id===m.id);if(!roi)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(m.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(m.normals,3));const material=new THREE.MeshStandardMaterial({color:roi.color,side:THREE.DoubleSide,roughness:.75,transparent:false,opacity:1,depthWrite:true});const mesh=new THREE.Mesh(geometry,material);mesh.userData.roiId=m.id;state.meshes.add(mesh);}
    if(!state.hasFit && state.meshes.children.length){state.fit();state.hasFit=true;}state.invalidate();worker?.terminate();
   };
   worker.onerror=e=>{setBusy(false);setError(e.message);worker?.terminate();};
   worker.postMessage({geometry:{cols:s.cols,rows:s.rows,depth:series.slices.length,spacing:[s.pixelSpacing[1],s.pixelSpacing[0],voxelDepth(series.slices,s)],origin:s.imagePositionPatient},items:relevant.map(r=>{const g=maskGeometry(s,maskScale(r));return {id:r.id,masks:r.sliceMasks,geometry:{cols:g.cols,rows:g.rows,spacing:[g.pixelSpacing[1],g.pixelSpacing[0],voxelDepth(series.slices,s)],origin:g.imagePositionPatient}};})});
  },200);
  return()=>{cancelled=true;clearTimeout(timer);worker?.terminate();};
 },[series,rois,onlyActive,activeRoiId,visible]);
 useEffect(()=>{const state=sceneRef.current;if(!state)return;state.meshes.children.forEach((m:any)=>{const roi=relevant.find(r=>r.id===m.userData.roiId);m.visible=!!roi;if(roi)m.material.color.set(roi.color);});state.invalidate();},[opacity,rois,onlyActive,activeRoiId]);
 return <div className="flex flex-col flex-1 min-h-0" data-testid="contours-3d"><div className="flex gap-2 items-center px-2 text-xs flex-wrap"><label><input type="checkbox" checked={onlyActive} onChange={e=>setOnlyActive(e.target.checked)}/>{tr('Solo ROI seleccionada')}</label><label>{tr('Opacidad 3D')}<input aria-label={tr('Opacidad 3D')} type="range" min="0" max="1" step=".05" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/><span className="inline-block w-9 text-right tabular-nums">{Math.round(opacity*100)}%</span></label><button onClick={()=>sceneRef.current?.fit()}>{tr('Restablecer vista 3D')}</button></div><div className="text-xs px-2 text-zinc-400">{tr('Arrastrar: rotar · Rueda: zoom · Botón derecho: desplazar')}{busy?' · '+tr('Calculando superficie…'):''}</div>{error && <p role="alert" className="text-amber-300 text-xs px-2">{tr(error)}</p>}{!relevant.length && <p className="text-xs px-2">{tr('No hay contornos visibles.')}</p>}<div ref={host} className="flex-1 min-h-0 overflow-hidden touch-none"/></div>;
}
