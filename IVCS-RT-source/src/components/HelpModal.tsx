import React,{useEffect,useState} from 'react';
import {About} from './About';
import {tr} from '../i18n';
import {LanguageSettings} from './LanguageSettings';
import {ShortcutSettings} from './ShortcutSettings';
export const HelpModal:React.FC<{isOpen:boolean;onClose:()=>void}>=({isOpen,onClose})=>{
 const [about,setAbout]=useState(false);
 useEffect(()=>{if(isOpen)setAbout(false);},[isOpen]);
 if(!isOpen)return null;
 if(about)return <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50"><section role="dialog" aria-modal="true" aria-label={tr('Acerca de IVCS RT')} className="bg-zinc-950 border border-zinc-700 rounded-lg max-w-3xl w-full p-5 space-y-4 max-h-[90vh] overflow-auto text-sm text-zinc-200"><header className="flex justify-between gap-3 sticky top-0 bg-zinc-950 py-2"><button id="btn-about-back" className="text-blue-300" onClick={()=>setAbout(false)}>← {tr('Volver a Ayuda')}</button><button onClick={onClose}>{tr('Cerrar')}</button></header><About/></section></div>;
 return <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50"><section role="dialog" aria-modal="true" aria-label={tr('Atajos y ayuda')} className="bg-zinc-950 border border-zinc-700 rounded-lg max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-auto text-sm text-zinc-200"><header className="flex justify-between"><h2 className="font-semibold">{tr('Atajos y ayuda')}</h2><button onClick={onClose}>{tr('Cerrar')}</button></header><LanguageSettings/>
 <p>{tr('Guardar: Ctrl+S o botón Guardar. No hay autoguardado. Administración y exportación masiva: Biblioteca → Administrar biblioteca.')}</p>
 <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-xs"><dt>{tr('Radio del pincel')}</dt><dd>{tr('Edite el radio en la barra contextual o use Mayús + rueda.')}</dd><dt>{tr('Navegación')}</dt><dd>{tr('La rueda recorre cortes. Puede escribir el número del corte directamente.')}</dd><dt>{tr('Vista 2×2')}</dt><dd>{tr('Doble clic en el título de un plano para ampliar o volver. Conserva posición y zoom.')}</dd><dt>{tr('Cuarto panel')}</dt><dd>{tr('Elija detalle del plano activo, comparación con secundaria o controles.')}</dd><dt>{tr('Estructuras')}</dt><dd>{tr('Seleccione una ROI para ver opacidad, volumen y copia. El menú ⋯ contiene las demás acciones.')}</dd><dt>{tr('Corregistro 3D')}</dt><dd>{tr('Revise las propuestas por puntos o automáticas antes de aceptar. El registro automático es experimental.')}</dd></dl>
 <ShortcutSettings/><footer className="flex justify-between gap-3"><button id="btn-show-about" className="border border-zinc-600 rounded px-4 py-2" onClick={()=>setAbout(true)}>{tr('Acerca de IVCS RT')}</button><button className="bg-blue-700 rounded px-4 py-2" onClick={onClose}>{tr('Entendido')}</button></footer></section></div>;
};
