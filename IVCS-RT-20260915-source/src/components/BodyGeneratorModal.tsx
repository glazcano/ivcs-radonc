import React, {useEffect, useRef, useState} from 'react';
import {X, Sparkles} from 'lucide-react';
import {tr} from '../i18n';
import type {DicomSeries, DicomSlice, StructureRoi} from '../types';
import type {BodyContourOptions} from '../utils/contourEngine';
import {computeBody, type BodyResult} from '../utils/bodyClient';
import {selectBodyReplacement, type BodyMasks} from '../utils/bodyAlgorithms';

interface Props {
  isOpen:boolean; onClose:()=>void; series:DicomSeries|null; currentSliceIndex:number; rois:StructureRoi[];
  onApplyBodyContour:(mode:'new'|'overwrite',id:string,data:{name:string;color:string},scope:'series'|'slice',masks:BodyMasks,preserveExisting?:boolean)=>void;
}

function BodyPreview({slice,mask,line,show,onLine}:{slice:DicomSlice;mask?:Uint8Array;line?:number;show:boolean;onLine:(row:number)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const context=canvas.current?.getContext('2d');if(!context)return;
    const {rows,cols,huData}=slice,image=context.createImageData(cols,rows);
    for(let i=0;i<huData.length;i++){
      const gray=Math.max(0,Math.min(255,Math.round((huData[i]+1000)/1400*255))),p=i*4;
      image.data[p]=gray;image.data[p+1]=gray;image.data[p+2]=gray;image.data[p+3]=255;
      if(show && mask?.[i]){
        const r=Math.floor(i/cols),c=i%cols;
        const edge=!r || !c || r===rows-1 || c===cols-1 || !mask[i-1] || !mask[i+1] || !mask[i-cols] || !mask[i+cols];
        image.data[p]=gray*(edge?0:.65);image.data[p+1]=edge?230:gray*.65+80;image.data[p+2]=edge?255:gray*.65+89;
      }
    }
    context.putImageData(image,0,0);
    if(line!==undefined){context.strokeStyle='#fbbf24';context.lineWidth=1.5;context.setLineDash([6,4]);context.beginPath();context.moveTo(0,line);context.lineTo(cols,line);context.stroke();context.setLineDash([]);}
  },[slice,mask,line,show]);
  return <canvas id="body-preview" ref={canvas} width={slice.cols} height={slice.rows}
    aria-label={tr('Vista previa de Auto BODY')}
    style={{width:'100%',aspectRatio:(slice.cols*slice.pixelSpacing[1])/(slice.rows*slice.pixelSpacing[0])}}
    className="block bg-black cursor-crosshair"
    onClick={e=>{if(line!==undefined){const rect=e.currentTarget.getBoundingClientRect();onLine(Math.round((e.clientY-rect.top)/rect.height*slice.rows));}}}/>;
}

export function BodyGeneratorModal({isOpen,onClose,series,currentSliceIndex,rois,onApplyBodyContour}:Props){
  const [mode,setMode]=useState<'new'|'overwrite'>('new'),[target,setTarget]=useState('');
  const [name,setName]=useState('BODY'),[color,setColor]=useState('#00E5FF');
  const [start,setStart]=useState(1),[end,setEnd]=useState(1),[position,setPosition]=useState(currentSliceIndex);
  const [threshold,setThreshold]=useState(-700),[closing,setClosing]=useState(2),[margin,setMargin]=useState(0);
  const [fill,setFill]=useState(true),[filter,setFilter]=useState(true),[disconnect,setDisconnect]=useState(true),[couch,setCouch]=useState(true);
  const [smoothing,setSmoothing]=useState(1),[area,setArea]=useState(20),[continuity,setContinuity]=useState(true);
  const [manualTable,setManualTable]=useState(false),[tablePercent,setTablePercent]=useState(85);
  const [preserve,setPreserve]=useState(true),[showMask,setShowMask]=useState(true);
  const [result,setResult]=useState<BodyResult|null>(null),[selected,setSelected]=useState<Set<number>>(new Set());
  const [processing,setProcessing]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{
    controller.current?.abort();setProcessing(false);setResult(null);setError('');
    if(isOpen && series){
      const existing=rois.find(r=>!r.locked && (r.type==='EXTERNAL' || /BODY|EXTERNAL/i.test(r.name)));
      setMode(existing?'overwrite':'new');setTarget(existing?.id || '');
      setStart(1);setEnd(series.slices.length);setPosition(Math.min(currentSliceIndex,series.slices.length-1));
    }
    return ()=>controller.current?.abort();
  },[isOpen,series,rois]);
  // Every calculation parameter invalidates the preview, so acceptance always matches the controls.
  useEffect(()=>{setResult(null);setError('');},[start,end,threshold,closing,margin,fill,filter,disconnect,couch,smoothing,area,continuity,manualTable,tablePercent]);
  if(!isOpen || !series || !series.slices.length)return null;
  const slice=series.slices[position] || series.slices[0],total=series.slices.length;
  const targetRoi=rois.find(r=>r.id===target);
  const close=()=>{controller.current?.abort();onClose();};
  const options:BodyContourOptions={thresholdHu:threshold,closingRadiusMm:closing,marginMm:margin,fillHoles:fill,
    removeTableAndNoise:filter,disconnectTableBridge:disconnect,suppressCouch:couch,smoothSkinPerimeter:smoothing>0,
    smoothingRadiusMm:smoothing,minComponentAreaMm2:area,useContinuity:continuity,
    tableExclusionFraction:manualTable?tablePercent/100:undefined};
  const validRange=Number.isInteger(start) && Number.isInteger(end) && start>=1 && end>=start && end<=total;
  const generate=async()=>{
    if(!validRange)return;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setProcessing(true);setProgress(0);setError('');setResult(null);
    try{
      const generated=await computeBody(series.slices.slice(start-1,end),options,abort.signal,setProgress);
      if(abort.signal.aborted)return;
      setResult(generated);setSelected(new Set(Object.keys(generated.masks).map(Number)));setPosition(start-1);
    }catch(e){if(!abort.signal.aborted)setError((e as Error).message);}
    finally{if(controller.current===abort)setProcessing(false);}
  };
  const accepted=Object.fromEntries(Object.entries<Uint8Array>(result?.masks || {}).filter(([key])=>selected.has(Number(key)) &&
    (mode==='new' || !preserve || !targetRoi?.sliceMasks[Number(key)]?.some(v=>v))));
  const accept=()=>{
    try{
      const masks=mode==='overwrite'?selectBodyReplacement(targetRoi,accepted,preserve):accepted;
      if(!Object.keys(masks).length)throw new Error('No hay cortes seleccionados para aplicar.');
      onApplyBodyContour(mode,target,{name:name.trim() || 'BODY',color},'slice',masks,preserve);close();
    }catch(e){setError((e as Error).message);}
  };
  const inputClass='bg-[#18191c] border border-[#36383d] rounded px-2 py-1 min-w-0';
  const buttonClass='px-3 py-1.5 rounded border border-[#36383d] hover:bg-[#282a30] disabled:opacity-40';
  const toggle=(label:string,value:boolean,set:(v:boolean)=>void)=><label className="flex items-center gap-2"><input type="checkbox" checked={value} onChange={e=>set(e.target.checked)}/>{tr(label)}</label>;
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3" onClick={close}>
    <div id="modal-body-generator" role="dialog" aria-modal="true" aria-label={tr('Auto BODY')} onClick={e=>e.stopPropagation()}
      className="bg-[#111215] border border-[#36383d] rounded-xl w-full max-w-5xl max-h-[95vh] flex flex-col text-xs text-gray-200 shadow-xl">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#36383d]">
        <div><h2 className="text-base font-semibold">{tr('Auto BODY')}</h2><p className="text-gray-400">{tr('Calcular, revisar y aplicar el contorno corporal')}</p></div>
        <button id="btn-close-body-modal" onClick={close} aria-label={tr('Cerrar')} className={buttonClass}><X size={16}/></button>
      </header>
      <div className="overflow-y-auto grid md:grid-cols-2 gap-4 p-4">
        <fieldset disabled={processing} className="space-y-4 min-w-0 disabled:opacity-60">
          <section className="space-y-2"><strong>{tr('Alcance')}</strong>
            <div className="flex gap-2"><button id="btn-body-scope-series" className={buttonClass} onClick={()=>{setStart(1);setEnd(total);}}>{tr('Toda la serie')}</button>
              <button id="btn-body-scope-slice" className={buttonClass} onClick={()=>{setStart(currentSliceIndex+1);setEnd(currentSliceIndex+1);}}>{tr('Corte actual')}</button></div>
            <div className="flex gap-2 items-center"><label>{tr('Desde el corte')} <input aria-label={tr('Desde el corte')} type="number" min={1} max={total} value={start} onChange={e=>setStart(+e.target.value)} className={inputClass+' w-20'}/></label>
              <label>{tr('Hasta el corte')} <input aria-label={tr('Hasta el corte')} type="number" min={start} max={total} value={end} onChange={e=>setEnd(+e.target.value)} className={inputClass+' w-20'}/></label></div>
          </section>
          <section className="space-y-2"><strong>{tr('Destino')}</strong>
            <select aria-label={tr('Destino BODY')} value={mode} onChange={e=>setMode(e.target.value as typeof mode)} className={inputClass+' w-full'}>
              <option value="new">{tr('Crear nueva estructura BODY')}</option><option value="overwrite">{tr('Reemplazar cortes de una estructura')}</option></select>
            {mode==='new'?<div className="flex gap-2"><input id="input-body-roi-name" aria-label={tr('Nombre ROI')} value={name} onChange={e=>setName(e.target.value)} className={inputClass+' flex-1'}/><input aria-label={tr('Color')} type="color" value={color} onChange={e=>setColor(e.target.value)}/></div>:
              <><select id="select-body-target-roi" aria-label={tr('Estructura de destino')} value={target} onChange={e=>setTarget(e.target.value)} className={inputClass+' w-full'}>
                <option value="">{tr('Seleccionar estructura')}</option>{rois.map(r=><option key={r.id} value={r.id} disabled={r.locked}>{r.name}{r.locked?' · '+tr('Bloqueada'):''}</option>)}</select>
                {toggle('Conservar cortes que ya tienen contorno',preserve,setPreserve)}
                <p className="text-gray-400">{tr('Protege todos los cortes no vacíos, incluidos los corregidos manualmente. Desactive para reemplazar los cortes seleccionados.')}</p></>}
          </section>
          <section className="space-y-2"><strong>{tr('Parámetros')}</strong>
            <div className="flex gap-2">{[[-700,'Estándar'],[-750,'Sensible'],[-650,'Ajustado']].map(([hu,label])=><button key={hu} className={buttonClass} onClick={()=>setThreshold(Number(hu))}>{tr(String(label))}</button>)}</div>
            <label className="flex justify-between items-center">{tr('Umbral de tejido (HU)')}<input aria-label={tr('Umbral de tejido (HU)')} type="number" min={-1000} max={0} step={10} value={threshold} onChange={e=>setThreshold(+e.target.value)} className={inputClass+' w-24'}/></label>
            <label className="flex justify-between items-center">{tr('Área mínima secundaria (mm²)')}<input type="number" min={0} max={500} value={area} onChange={e=>setArea(Math.max(0,+e.target.value))} className={inputClass+' w-24'}/></label>
            {toggle('Filtrar componentes externos',filter,setFilter)}
            {toggle('Conservar regiones pequeñas entre cortes vecinos',continuity,setContinuity)}
            {toggle('Detectar componentes de mesa',couch,setCouch)}
            {toggle('Separar contacto con mesa en una banda local',disconnect,setDisconnect)}
            {toggle('Rellenar cavidades internas',fill,setFill)}
            <label className="flex justify-between items-center">{tr('Cerrar aberturas (mm)')}<input type="number" min={0} max={4} step={.5} value={closing} onChange={e=>setClosing(Math.max(0,Math.min(4,+e.target.value)))} className={inputClass+' w-24'}/></label>
            <label className="flex justify-between items-center">{tr('Regularización del borde (mm)')}<input type="number" min={0} max={2} step={.5} value={smoothing} onChange={e=>setSmoothing(Math.max(0,Math.min(2,+e.target.value)))} className={inputClass+' w-24'}/></label>
            <label className="flex justify-between items-center">{tr('Margen final (mm)')}<input type="number" min={-5} max={5} step={.5} value={margin} onChange={e=>setMargin(Math.max(-5,Math.min(5,+e.target.value)))} className={inputClass+' w-24'}/></label>
          </section>
          <section className="space-y-2">
            {toggle('Línea manual de exclusión de mesa',manualTable,setManualTable)}
            {manualTable && <><input aria-label={tr('Posición de la línea de mesa')} type="range" min={0} max={100} step={.1} value={tablePercent} onChange={e=>setTablePercent(+e.target.value)} className="w-full"/>
              <p className="text-amber-300">{tr('Se excluye todo lo situado debajo de la línea amarilla. Pulse la imagen para moverla. Compruebe su posición en los cortes seleccionados.')}</p></>}
          </section>
        </fieldset>
        <section className="min-w-0 space-y-2">
          <BodyPreview slice={slice} mask={result?.masks[slice.sliceIndex]} line={manualTable?Math.round(slice.rows*tablePercent/100):undefined} show={showMask} onLine={row=>{if(!processing)setTablePercent(Math.max(0,Math.min(100,row/slice.rows*100)));}}/>
          <div className="flex items-center justify-between"><span>{tr('Corte')} {position+1} / {total}</span>{toggle('Mostrar resultado',showMask,setShowMask)}</div>
          <input aria-label={tr('Corte de vista previa')} type="range" min={0} max={total-1} value={position} onChange={e=>setPosition(+e.target.value)} className="w-full"/>
          {result && <>
            <p className="text-cyan-300">{tr('Vista previa: todavía no se ha modificado ninguna estructura.')}</p>
            <div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={()=>setSelected(new Set(Object.keys(result.masks).map(Number)))}>{tr('Seleccionar todos')}</button><button className={buttonClass} onClick={()=>setSelected(new Set())}>{tr('Deseleccionar todos')}</button>
              <button className={buttonClass} onClick={()=>{const items=result.review.filter(r=>r.reasons.length);const next=items.find(r=>start-1+r.position>position) || items[0];if(next)setPosition(start-1+next.position);}}>{tr('Siguiente corte para revisar')}</button></div>
            <div className="max-h-44 overflow-auto border border-[#36383d] rounded" aria-label={tr('Revisión por cortes')}>
              {result.review.map(item=><div key={item.sliceIndex} className={'flex gap-2 items-center px-2 py-1 '+(slice.sliceIndex===item.sliceIndex?'bg-cyan-950':'')}>
                <input aria-label={tr('Aplicar corte')+' '+(start+item.position)} type="checkbox" checked={selected.has(item.sliceIndex)} onChange={e=>setSelected(prev=>{const next=new Set(prev);e.target.checked?next.add(item.sliceIndex):next.delete(item.sliceIndex);return next;})}/>
                <button className="text-left flex-1" onClick={()=>setPosition(start-1+item.position)}>{start+item.position} · {(item.areaMm2/100).toFixed(1)} cm² · {item.reasons.length?item.reasons.map(r=>tr(r)).join(' · '):tr('Sin avisos automáticos')}
                  {mode==='overwrite' && preserve && targetRoi?.sliceMasks[item.sliceIndex]?.some(v=>v)?' · '+tr('Conservado'):''}</button>
              </div>)}
            </div>
            <p className="text-gray-400">{tr('Los avisos orientan la revisión; la ausencia de avisos no confirma la exactitud del contorno.')}</p>
          </>}
        </section>
      </div>
      <footer className="border-t border-[#36383d] p-3 space-y-2">
        {error && <p role="alert" className="text-amber-300">{tr(error)}</p>}
        {processing && <div role="status">{tr('Calculando y comprobando BODY')} · {progress}%<progress value={progress} max={100} className="w-full"/></div>}
        <div className="flex justify-end gap-2">
          <button id="btn-cancel-body-generation" onClick={close} className={buttonClass}>{tr('Cancelar')}</button>
          <button id="btn-execute-body-generation" onClick={generate} disabled={processing || !validRange} className={buttonClass+' flex items-center gap-2'}><Sparkles size={14}/>{tr(result?'Recalcular vista previa':'Calcular vista previa')}</button>
          <button id="btn-apply-body-generation" onClick={accept} disabled={!result || processing || !Object.keys(accepted).length || (mode==='overwrite' && (!targetRoi || targetRoi.locked))} className={buttonClass+' bg-cyan-700'}>{tr('Aplicar cortes seleccionados')} ({Object.keys(accepted).length})</button>
        </div>
      </footer>
    </div>
  </div>;
}
