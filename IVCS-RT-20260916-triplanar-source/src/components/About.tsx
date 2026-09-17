import React from 'react';
import {tr} from '../i18n';
import {APP_NAME,REVISION_CODE,PROJECT_CREDITS,REFERENCES} from '../appInfo';

export function About(){
  return <div id="about-ivcs-rt" className="space-y-5">
    <div><h3 className="text-xl font-semibold">{APP_NAME}</h3><p className="text-xs text-cyan-300 mt-1">{tr('Código de revisión')} · <span className="font-mono">{REVISION_CODE}</span></p>
      <p className="text-xs text-zinc-400 mt-1">{tr('Fecha de compilación en formato AAAAMMDD (Santiago de Chile).')}</p></div>
    <section className="space-y-2"><h3 className="font-semibold">{tr('Desarrollo y transparencia')}</h3>
      <p>{tr('Este software fue vibecodeado con ayuda de Google AI Studio y Chat GPT 6 Astra: desarrollo iterativo mediante instrucciones, generación de código y revisión con asistencia de inteligencia artificial.')}</p>
      <p className="text-zinc-400 text-xs">{tr('Aplicación portátil de uso local para visualización DICOM y contouring de radioterapia. El cálculo de imágenes y contornos se realiza en el equipo; estas herramientas de IA se utilizaron durante el desarrollo y no son necesarias para ejecutar el programa.')}</p>
    </section>
    <section className="space-y-2"><h3 className="font-semibold">MIT License</h3><p>Copyright © 2026 Gabriel Lazcano</p><p className="text-xs text-zinc-400">{tr('Se permite usar, modificar y redistribuir este software, incluido el uso comercial, conservando el aviso de copyright y la licencia. Se proporciona sin garantía. Las dependencias mantienen sus propias licencias.')}</p><a href="/LICENSE.txt" download="IVCS_RT_LICENSE.txt" className="text-blue-300 underline">{tr('Leer licencia MIT completa')}</a></section>
    <section className="space-y-2"><h3 className="font-semibold">{tr('Bibliotecas y herramientas')}</h3>
      <p className="text-xs text-zinc-400">{tr('Inventario de dependencias directas del proyecto y del ejecutor local. Las dependencias declaradas sin uso actual se identifican explícitamente.')}</p>
      <div className="border border-zinc-700 rounded overflow-x-auto"><table className="w-full text-xs text-left"><thead className="bg-zinc-900"><tr><th className="p-2">{tr('Biblioteca')}</th><th className="p-2">{tr('Uso')}</th><th className="p-2">{tr('Licencia')}</th></tr></thead>
        <tbody>{PROJECT_CREDITS.map(item=><tr key={item.name} className="border-t border-zinc-800"><td className="p-2">{item.url?<a className="text-blue-300 underline" href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a>:item.name}</td><td className="p-2">{tr(item.usage)}</td><td className="p-2">{tr(item.license)}</td></tr>)}</tbody></table></div>
      <a className="text-blue-300 underline text-xs" href="/third-party-notices.txt" download="IVCS_RT_licencias.txt">{tr('Descargar avisos y licencias incluidos')}</a>
    </section>
    <section className="space-y-3"><h3 className="font-semibold">{tr('Referencias consultadas')}</h3>
      {REFERENCES.map(item=><div key={item.url} className="text-xs"><a className="text-blue-300 underline" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a><p className="text-zinc-400 mt-1">{tr(item.use)}</p></div>)}
      <p className="text-xs text-zinc-400">{tr('Esta información y los avisos de licencia están disponibles sin conexión. Los enlaces a las fuentes externas requieren acceso a Internet.')}</p>
    </section>
  </div>;
}
