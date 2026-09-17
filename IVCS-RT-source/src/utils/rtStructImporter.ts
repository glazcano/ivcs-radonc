import dicomParser from 'dicom-parser';
import type {DicomSeries,StructureRoi,RoiType} from '../types';
import {rasterizeLoops,Point} from './rtGeometry';
import {validateVolume,voxelDepth} from './geometry';
import {distanceSquared} from './distance';
import {dicomText} from './dicomText';
const items=(ds:any,tag:string)=>ds.elements[tag]?.items?.map((i:any)=>i.dataSet) || [];
export function importRtStruct(bytes:Uint8Array,series:DicomSeries):StructureRoi[]{
  validateVolume(series.slices);const ds:any=dicomParser.parseDicom(bytes);
  if(ds.string('x00080016')!=='1.2.840.10008.5.1.4.1.1.481.3')throw new Error('El archivo no es RTSTRUCT.');
  if(dicomText(ds,'x00100020')!==series.patientId)throw new Error('La ID del paciente RTSTRUCT no coincide.');
  if(ds.string('x0020000d')!==series.studyInstanceUID)throw new Error('El estudio DICOM no coincide con la referencia.');
  const definitions=items(ds,'x30060020'),contours=items(ds,'x30060039'),observations=items(ds,'x30060080');
  return definitions.map((definition:any)=>{
    if(definition.string('x30060024')!==series.frameOfReferenceUID)throw new Error('El marco de referencia DICOM no coincide.');
    const number=definition.string('x30060022'),entry=contours.find((d:any)=>d.string('x30060084')===number);
    const color=(entry?.string('x3006002a') || '255\\0\\0').split('\\').map(Number);
    const bySlice=new Map<number,Point[][]>();let kind='';
    for(const contour of items(entry || {elements:{}},'x30060040')){
      const type=contour.string('x30060042');if(!['CLOSED_PLANAR','CLOSEDPLANAR_XOR'].includes(type))throw new Error('Solo se admiten contornos planares cerrados.');
      if(kind && kind!==type)throw new Error('Una ROI mezcla tipos de contorno incompatibles.');kind=type;
      const references=items(contour,'x30060016');
      if(references.length!==1)throw new Error('El contorno debe referenciar una imagen concreta.');
      const slice=series.slices.find(s=>s.sopInstanceUID===references[0].string('x00081155'));
      if(!slice)throw new Error('RTSTRUCT referencia imágenes que no están en la serie abierta.');
      const xyz=(contour.string('x30060050') || '').split('\\').map(Number),n=Number(contour.string('x30060046'));
      if(n<3 || xyz.length!==n*3 || !xyz.every(Number.isFinite))throw new Error('Coordenadas RTSTRUCT inválidas.');
      const origin=slice.imagePositionPatient!,poly:Point[]=[];
      for(let i=0;i<xyz.length;i+=3){if(Math.abs(xyz[i+2]-origin[2])>0.05)throw new Error('Contorno fuera del plano de la imagen referenciada.');poly.push([(xyz[i]-origin[0])/slice.pixelSpacing[1],(xyz[i+1]-origin[1])/slice.pixelSpacing[0]]);}
      if(poly.some(([x,y])=>x<-.501 || y<-.501 || x>slice.cols-.499 || y>slice.rows-.499))throw new Error('El contorno excede la imagen. Se canceló la importación para evitar recortarlo.');
      bySlice.set(slice.sliceIndex,[...(bySlice.get(slice.sliceIndex)||[]),poly]);
    }
    const sliceMasks={};for(const [z,loops] of bySlice){const slice=series.slices[z];sliceMasks[z]=rasterizeLoops(loops,slice.rows,slice.cols,kind==='CLOSEDPLANAR_XOR');}
    const rawType=observations.find((d:any)=>d.string('x30060084')===number)?.string('x300600a4');
    const type:RoiType=['GTV','CTV','PTV','EXTERNAL','SUPPORT','AVOIDANCE'].includes(rawType)?rawType:'OAR';
    return {id:'import-'+number+'-'+crypto.randomUUID(),name:dicomText(definition,'x30060026',ds.string('x00080005')) || 'ROI '+number,type,color:'#'+color.map((c:number)=>Math.max(0,Math.min(255,c)).toString(16).padStart(2,'0')).join(''),visible:true,locked:false,opacity:.4,sliceMasks};
  });
}
export function compareContours(original:StructureRoi[],restored:StructureRoi[],series:DicomSeries){
  return original.map((roi,index)=>{
    const other=restored[index];let before=0,after=0,common=0,volumeBefore=0,volumeAfter=0,maxBoundaryDistanceMm=0;const changedSlices:number[]=[];
    for(const slice of series.slices){const a=roi.sliceMasks[slice.sliceIndex],b=other?.sliceMasks[slice.sliceIndex];let changed=false,ca=0,cb=0;
      for(let i=0;i<slice.rows*slice.cols;i++){const av=a?.[i] || 0,bv=b?.[i] || 0;ca+=av;cb+=bv;common+=av && bv?1:0;if(av!==bv)changed=true;}
      before+=ca;after+=cb;const factor=slice.pixelSpacing[0]*slice.pixelSpacing[1]*voxelDepth(series.slices,slice)/1000;volumeBefore+=ca*factor;volumeAfter+=cb*factor;if(changed)changedSlices.push(slice.sliceIndex+1);
      if(changed){
        const boundary=(m?:Uint8Array)=>Uint8Array.from({length:slice.rows*slice.cols},(_,i)=>{const x=i%slice.cols,y=Math.floor(i/slice.cols);return m?.[i] && (x===0 || y===0 || x===slice.cols-1 || y===slice.rows-1 || !m[i-1] || !m[i+1] || !m[i-slice.cols] || !m[i+slice.cols])?1:0;});
        const ba=boundary(a),bb=boundary(b);if(!ca || !cb)maxBoundaryDistanceMm=Infinity;
        else for(const [source,target] of [[ba,bb],[bb,ba]]){const distance=distanceSquared(target,slice.cols,slice.rows,1,[slice.pixelSpacing[1],slice.pixelSpacing[0],1]);for(let i=0;i<source.length;i++)if(source[i])maxBoundaryDistanceMm=Math.max(maxBoundaryDistanceMm,Math.sqrt(distance[i]));}
      }
    }
    return {name:roi.name,before,after,dice:before+after?2*common/(before+after):1,volumeBefore,volumeAfter,changedSlices,maxBoundaryDistanceMm};
  });
}
