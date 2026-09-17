import {tr} from '../i18n';
import React, {useState,useEffect,useRef} from 'react';
import {Library,Search,ChevronDown,FolderOpen,X} from 'lucide-react';
import {libraryIndex,filterPatients,LibraryIndex,LibraryGroup} from '../utils/libraryClient';

export function LibraryMenu({onOpen,busy}:{onOpen:(key:string,group?:LibraryGroup)=>Promise<void>;busy:boolean}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[expanded,setExpanded]=useState<string|null>(null);
  const [index,setIndex]=useState<LibraryIndex|null>(null),[error,setError]=useState('');
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=> {
    if(!open)return;
    libraryIndex().then(setIndex).catch(e=>setError(e.message));
    const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
  },[open]);
  const patients=filterPatients(index?.patients || [],query).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  const launch=async(key:string,group?:LibraryGroup)=>{try{await onOpen(key,group);setOpen(false);}catch(e){setError((e as Error).message);}};
  return <div ref={root} className="relative">
    <button aria-expanded={open} aria-controls="patient-library" onClick={()=>setOpen(!open)} className="flex gap-1.5 items-center px-2 py-1.5 rounded border border-[#444] text-xs text-blue-300"><Library size={15}/>{" "}{tr("Biblioteca")}{" "}<ChevronDown size={12}/></button>
    {open && <section id="patient-library" aria-label={tr("Biblioteca local de pacientes")} className="absolute left-0 top-full mt-2 w-[380px] max-w-[90vw] bg-[#151519] border border-[#414149] rounded-lg z-[100] text-xs">
      <div className="flex justify-between items-center p-3"><strong>{" "}{tr("Pacientes ·")}{" "}{index?.patients.length ?? '…'}</strong><button aria-label={tr("Cerrar biblioteca")} onClick={()=>setOpen(false)}><X size={15}/></button></div>
      <div className="mx-3 mb-2 flex gap-2 items-center border border-[#444] rounded px-2"><Search size={14}/><input autoFocus aria-label={tr("Filtrar pacientes")} placeholder={tr("ID, nombre, apellido, modalidad, fecha…")} value={query} onChange={e=>setQuery(e.target.value)} className="bg-transparent py-2 w-full outline-none"/></div>
      <div className="max-h-[55vh] overflow-auto px-2 pb-2">
        {error && <p role="alert" className="p-2 text-red-300">{" "}{tr(error)}{" "}</p>}
        {index && !patients.length && <p className="p-3 text-gray-400">{query?tr("Sin coincidencias."):tr("Importa DICOM o una sesión para añadir pacientes.")}</p>}
        {patients.map(patient=><div key={patient.key} className="border-b border-[#303036]">
          <button onClick={()=>setExpanded(expanded===patient.key?null:patient.key)} aria-expanded={expanded===patient.key || !!query} className="w-full text-left p-2 hover:bg-[#24242b] rounded">
            <div className="flex justify-between"><strong className="font-mono text-blue-300">{patient.id}</strong><span className="text-gray-400">{patient.studies.length}{" "}{tr("series")}{" "}</span></div>
            <div className="mt-0.5 truncate">{patient.name.replace(/\^/g,' ') || tr("Sin nombre")}</div>
          </button>
          {(expanded===patient.key || !!query) && <div className="pl-3 pb-2">
            {patient.studies.map(study=><div key={study.key} className="flex items-center gap-1 hover:bg-[#24242b] rounded pr-2">
              <button disabled={busy} onClick={()=>launch(study.key)} className="flex-1 min-w-0 text-left py-2 px-1 disabled:opacity-40" title={`${study.studyDescription} · ${study.description}`}>
                <div className="truncate"><span className="text-blue-200 mr-1">{study.modality}</span>{study.description || study.studyDescription || tr("Sin descripción")}</div>
                <div className="text-[11px] text-gray-400">{study.date || tr("Sin fecha")} · {study.slices}{" "}{tr("cortes ·")}{" "}{study.originals ? tr("{0} DICOM", [study.originals]):tr("Sin originales DICOM")}</div>
              </button>
              {patient.groups.filter(g=>g.members.includes(study.key)).map(group=><button key={group.id} disabled={busy} onClick={()=>launch(group.referenceKey,group)} title={tr("{0}: abrir corregistro guardado", [group.label])} aria-label={tr("{0}: abrir corregistro guardado", [group.label])} className="p-1"><span className="block w-2.5 h-2.5 rounded-full" style={{backgroundColor:group.color}}/></button>)}
            </div>)}
            {!!patient.groups.length && <div className="flex flex-wrap gap-2 text-[11px] text-gray-400 pt-1">{patient.groups.map(g=><span key={g.id} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{backgroundColor:g.color}}/>{g.label}</span>)}</div>}
          </div>}
        </div>)}
      </div>
      <a href="/library" target="_blank" rel="noopener" className="block px-3 py-3 text-blue-300 border-t border-[#333]">{" "}{tr("Administrar biblioteca ↗")}{" "}</a>
      <div className="p-3 border-t border-[#333] text-[11px] text-gray-400"><div className="flex gap-1 items-center"><FolderOpen size={12}/>{" "}{tr("Almacenamiento local · carpeta portable")}{" "}</div><div className="mt-1 break-all select-text">{index?.folder || tr("Conectando…")}</div></div>
    </section>}
  </div>;
}
