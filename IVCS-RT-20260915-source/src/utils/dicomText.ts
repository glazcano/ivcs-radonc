export function dicomText(ds:any,tag:string,charset?:string):string|undefined{
  const element=ds.elements[tag];if(!element)return undefined;
  const encoding=charset || ds.string('x00080005') || '';
  if(!['','ISO_IR 6','ISO_IR 100','ISO_IR 192'].includes(encoding))throw new Error('Juego de caracteres DICOM no soportado: '+encoding);
  const bytes=ds.byteArray.subarray(element.dataOffset,element.dataOffset+element.length);
  return new TextDecoder(encoding==='ISO_IR 192'?'utf-8':'latin1').decode(bytes).replace(/[\0 ]+$/g,'');
}
