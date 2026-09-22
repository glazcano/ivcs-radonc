import {tr} from '../i18n';
import React,{useRef,useState} from 'react';
import {DicomSeries,StructureRoi} from '../types';
interface HeaderProps {
  activeRoiName?:string;
  library?: React.ReactNode;
  series: DicomSeries | null;
  currentSliceIndex: number;
  rois: StructureRoi[];
  onOpenSession: (file: File) => void;
  sessionReady: boolean;
  saveStatus: string;
  onSave: () => void;
  isSaving: boolean;
  onFilesSelected: (files: File[]) => void;
  onExportRoisJson: () => void;
  onExportCsvReport: () => void;
  onOpenMonacoExportModal?: () => void;
  onOpenDicomZip?: (advanced:boolean) => void;
  onShowHelp: () => void;
  studiesCount?: number;
  isRegistrationActive?: boolean;
  onOpenRegistrationModal?: () => void;
}

export const Header:React.FC<HeaderProps> = props=>{
  const {library,series,saveStatus,onSave,isSaving,sessionReady}=props;
  const json=useRef<HTMLInputElement>(null),dicom=useRef<HTMLInputElement>(null),[menu,setMenu]=useState(false),[exports,setExports]=useState(false);
  const button='px-2 py-1.5 border border-zinc-600 rounded text-xs hover:bg-zinc-800 disabled:opacity-40';
  return <header className="bg-zinc-950 border-b border-zinc-700 text-zinc-200 px-3 py-2 flex flex-wrap items-center gap-2">
    <span className="text-xs font-semibold tracking-wide text-zinc-300 shrink-0">IVCS RT</span>{library}<div className="flex-1 min-w-40 text-xs"><div className="font-semibold text-blue-200">{series?`${series.patientId} · ${series.patientName.replace(/\^/g,' ')}`:tr("IVCS RT · Contouring local")}</div><div className="text-zinc-400 truncate max-w-xl" title={series?.seriesDescription}>{series?`${series.modality} · ${series.seriesDescription}`:tr("Abra un paciente para comenzar")}{series?.resampling && <span className="text-amber-300 ml-2" title={tr('Reconstrucción axial por interpolación trilineal. Se conserva el volumen original para corregistro y exportación.')}>MPR · {series.resampling.spacingMm.toFixed(2)} mm{series.resampling.irregular && <span> · {tr("Espaciado irregular")}{!!series.resampling.gaps && ` · ${series.resampling.gaps} ${tr("huecos sin interpolar")}`}</span>}</span>}</div></div>
    <span role="status" className="text-[11px] max-w-40">{" "}{tr(saveStatus)}{" "}</span><button className="bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded text-xs disabled:opacity-40" title={tr("Guardar en carpeta local (Ctrl+S)")} onClick={onSave} disabled={!sessionReady || isSaving}>{" "}{tr("Guardar")}{" "}</button>
    <button id="btn-open-registration" className={button} onClick={props.onOpenRegistrationModal}>{" "}{tr("Corregistro 3D")}{" "}{props.isRegistrationActive?tr(" · ON"):''}</button>
    <div className="relative"><button id="btn-export-menu" className={button} onClick={()=>{setExports(!exports);setMenu(false);}}>{" "}{tr("Exportar RT")}{" "}</button>{exports && <div className="absolute right-0 top-full mt-2 w-60 bg-zinc-900 border border-zinc-600 p-2 rounded z-50 flex flex-col gap-1"><button id="btn-export-monaco" className={button} onClick={()=>{props.onOpenMonacoExportModal?.();setExports(false);}}>{" "}{tr("TPS RTSTRUCT")}{" "}</button><button id="btn-export-dicom-zip" className={button} disabled={!series} onClick={()=>{props.onOpenDicomZip?.(false);setExports(false);}}>{tr('DICOM .zip')}</button><button id="btn-export-dicom-zip-advanced" className={button} disabled={!series} onClick={()=>{props.onOpenDicomZip?.(true);setExports(false);}}>{tr('DICOM .zip avanzado')}</button><button id="btn-export-json" className={button} onClick={()=>{props.onExportRoisJson();setExports(false);}}>{" "}{tr("Guardar sesión portable")}{" "}</button><button id="btn-export-csv" className={button} onClick={()=>{props.onExportCsvReport();setExports(false);}}>{" "}{tr("Reporte volumétrico CSV")}{" "}</button></div>}</div>
    <input ref={json} type="file" accept=".json,.ivcs" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)props.onOpenSession(f);e.target.value='';}}/><input ref={dicom} type="file" accept=".dcm,.zip" multiple className="hidden" onChange={e=>{if(e.target.files?.length)props.onFilesSelected(Array.from(e.target.files));e.target.value='';}}/>
    <div className="relative"><button className={button} onClick={()=>{setMenu(!menu);setExports(false);}}>{" "}{tr("Archivo y ayuda")}{" "}</button>{menu && <div className="absolute right-0 top-full mt-2 w-52 bg-zinc-900 border border-zinc-600 p-2 rounded z-50 flex flex-col gap-1"><button id="btn-open-dicom" className={button} disabled={!sessionReady} onClick={()=>{dicom.current?.click();setMenu(false);}}>{" "}{tr("Abrir DICOM / ZIP")}{" "}</button><button className={button} disabled={!sessionReady} onClick={()=>{json.current?.click();setMenu(false);}}>{" "}{tr("Abrir sesión")}{" "}</button><button id="btn-show-help" className={button} onClick={()=>{props.onShowHelp();setMenu(false);}}>{" "}{tr("Atajos y ayuda")}{" "}</button></div>}</div>
  </header>;
};
