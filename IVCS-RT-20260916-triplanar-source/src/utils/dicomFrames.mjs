// A frame view overlays functional-group attributes without copying pixel bytes.
// Original SOP identity and one-based frame numbers remain intact.
export function frameDataset(ds,index){
 const count=ds.intString('x00280008') || 1;
 if(!Number.isInteger(index) || index<0 || index>=count)throw new Error('Invalid DICOM frame index.');
 if(count===1 && !ds.elements.x52009230)return ds;
 const sop=ds.string('x00080016');
 if(!['1.2.840.10008.5.1.4.1.1.2.1','1.2.840.10008.5.1.4.1.1.4.1','1.2.840.10008.5.1.4.1.1.2.2','1.2.840.10008.5.1.4.1.1.4.4','1.2.840.10008.5.1.4.1.1.30'].includes(sop))throw new Error('Unsupported multiframe SOP class.');
 const per=ds.elements.x52009230?.items;
 if(!per || per.length!==count)throw new Error('Incomplete per-frame functional groups.');
 const shared=ds.elements.x52009229?.items?.[0]?.dataSet,frame=per[index].dataSet;
 const overlay={};
 for(const [sequence,tags] of [
  ['x00289110',['x00280030','x00180050','x00180088']],
  ['x00209113',['x00200032']],['x00209116',['x00200037']],
  ['x00289145',['x00281052','x00281053','x00281054']],
  ['x00289132',['x00281050','x00281051']],
  ['x00189114',['x00189082']],['x00189117',['x00189087','x00189089']],
  ['x00209253',['x00189245']],['x00189118',['x00189241']],
  ['x00209111',['x00209128','x00209056','x00209156']]
 ]){
  const a=shared?.elements[sequence]?.items?.[0]?.dataSet,b=frame?.elements[sequence]?.items?.[0]?.dataSet;
  for(const tag of tags){if(a?.elements[tag])overlay[tag]=a;if(b?.elements[tag])overlay[tag]=b;}
 }
 for(const parent of [shared,frame]){
  const gradient=parent?.elements.x00189117?.items?.[0]?.dataSet?.elements.x00189076?.items?.[0]?.dataSet;
  if(gradient?.elements.x00189089)overlay.x00189089=gradient;
 }
 for(const tag of ['x00200032','x00200037','x00280030'])if(!overlay[tag])throw new Error('Missing Enhanced DICOM frame geometry.');
 const view=Object.create(ds);view.elements={...ds.elements};
 const mapping=frame?.elements.x00409096 || shared?.elements.x00409096;
 if(mapping)view.elements.x00409096=mapping;
 for(const [tag,source] of Object.entries(overlay))view.elements[tag]=source.elements[tag];
 for(const method of ['string','uint16','int16','intString','float','double','uint32'])view[method]=(tag,...args)=>(overlay[tag] || ds)[method](tag,...args);
 const getString=view.string;
 view.string=(tag)=>tag==='x00200100' && overlay.x00209128?String(overlay.x00209128.uint32('x00209128')):tag==='x00180081' && overlay.x00189082?String(overlay.x00189082.double('x00189082')):getString(tag);
 view.frameNumber=index+1;
 return view;
}
