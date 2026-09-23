declare const __IVCS_REVISION__: string | undefined;
declare const __IVCS_CREDITS__: {name:string;license:string;url:string;usage:string}[] | undefined;

export const APP_NAME='IVCS RT';
export function revisionForDate(date=new Date()):string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('');
}
// Injected at compilation: opening the same build tomorrow does not change its identity.
export const REVISION_CODE=typeof __IVCS_REVISION__==='string'?__IVCS_REVISION__:revisionForDate();
export const PROJECT_CREDITS=typeof __IVCS_CREDITS__!=='undefined'?__IVCS_CREDITS__:[];
export const REFERENCES=[
  {title:'Klein et al. (2010) — elastix: A Toolbox for Intensity-Based Medical Image Registration',url:'https://elastix.dev/marius/downloads/2010_j_TMI.pdf',use:'Información mutua con estimación suave y selección de métricas; elastix no es una dependencia del programa.'},
  {title:'3D Slicer — Segment Editor: Smoothing and Islands',url:'https://slicer.readthedocs.io/en/latest/user_guide/modules/segmenteditor.html#smoothing',use:'Referencia metodológica para mediana y morfología binaria 3D; implementación local, sin dependencia de Slicer.'},
  {title:'DICOM PS3.3, C.7.4 — Frame of Reference',url:'https://dicom.nema.org/medical/dicom/2026a/output/chtml/part03/sect_C.7.4.html',use:'Preservación de relaciones espaciales entre series que comparten marco de referencia.'},
  {title:'DICOM PS3.3, C.7.6.2 — Image Plane Module',url:'https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.7.6.2.html',use:'Posición, orientación y espaciado para reconstrucción de adquisiciones oblicuas.'},
  {title:'DICOM PS3.3, C.20.2 — Spatial Registration',url:'https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.20.2.html',use:'Exportación del corregistro rígido 3D mediante objetos DICOM REG.'},
  {title:'Horn (1987) — Closed-form solution of absolute orientation using unit quaternions',url:'https://people.csail.mit.edu/bkph/papers/Absolute_Orientation_Scanned.pdf',use:'Ajuste rígido por puntos anatómicos.'},
  {title:'Studholme, Hill & Hawkes (1999) — An overlap invariant entropy measure of 3D medical image alignment',url:'https://doi.org/10.1016/S0031-3203(98)00091-0',use:'Fundamento de la información mutua normalizada para corregistro.'},
  {title:'SimpleITK — Registration Overview',url:'https://simpleitk.readthedocs.io/en/main/registrationOverview.html',use:'Referencia conceptual de corregistro; SimpleITK no es una dependencia del programa.'},
  {title:'SimpleITK — Signed Maurer Distance Map; Maurer, Qi & Raghavan (2003)',url:'https://simpleitk.org/doxygen/v1_0/html/classitk_1_1simple_1_1SignedMaurerDistanceMapImageFilter.html',use:'Referencia sobre distancias euclídeas y morfología; la implementación es local.'},
  {title:'DICOM PS3.3, C.8.8.6.3 — Representing Inner and Outer Contours',url:'https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_c.8.8.6.3.html',use:'Representación de contornos, huecos y XOR en RTSTRUCT.'},
];
