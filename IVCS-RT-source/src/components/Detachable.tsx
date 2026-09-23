import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {tr} from '../i18n';

/** One React tree and one session, even when a panel lives on another monitor. */
export function Detachable({children, title, id, enabled=true}: {children:React.ReactNode;title:string;id:string;enabled?:boolean}) {
  const child = useRef<Window|null>(null);
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const [error,setError]=useState(false);
  const dock=()=>{const w=child.current;child.current=null;setTarget(null);w?.close();};
  useEffect(()=>{
    const close=()=>child.current?.close();
    window.addEventListener('pagehide',close);
    return()=>{window.removeEventListener('pagehide',close);close();};
  },[]);
  useEffect(()=>{if(!enabled)dock();},[enabled]);
  const detach=()=>{
    if(child.current && !child.current.closed){child.current.focus();return;}
    const w=window.open('about:blank','', `popup,width=${id==='tools'?480:900},height=800`);
    if(!w){setError(true);return;}
    child.current=w;setError(false);
    w.document.title=`IVCS RT · ${title}`;
    w.document.documentElement.lang=document.documentElement.lang;
    w.document.documentElement.dir=document.documentElement.dir;
    const styles:Promise<void>[]=[];
    for(const el of document.querySelectorAll('style,link[rel="stylesheet"]')){const copy=el.cloneNode(true) as HTMLElement;if(el.tagName==='LINK'){(copy as HTMLLinkElement).href=(el as HTMLLinkElement).href;styles.push(new Promise(resolve=>{copy.onload=()=>resolve();copy.onerror=()=>resolve();}));}w.document.head.appendChild(copy);}
    w.document.body.style.cssText='margin:0;background:#09090b;color:#e4e4e7;overflow:hidden';
    const root=w.document.createElement('div');root.style.cssText='height:100vh;display:flex;flex-direction:column;min-height:0';w.document.body.appendChild(root);
    w.addEventListener('pagehide',()=>{if(child.current===w){child.current=null;setTarget(null);}});
    let held=false;
    w.addEventListener('pointerdown',()=>held=true);w.addEventListener('pointerup',()=>held=false);w.addEventListener('blur',()=>held=false);
    for(const type of ['keydown','keyup'])w.addEventListener(type,event=>{const e=event as KeyboardEvent;if((held&&type==='keydown')||['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName)||['Enter','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown'].includes(e.key))return;window.dispatchEvent(new KeyboardEvent(type,{key:e.key,code:e.code,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,altKey:e.altKey,repeat:e.repeat}));if(e.ctrlKey||e.metaKey)e.preventDefault();});
    // Fit the image only after CSS has established the actual popup viewport.
    void Promise.all(styles).then(()=>{if(child.current===w && !w.closed)setTarget(root);});
  };
  const content=<div className="flex flex-col flex-1 min-h-0 min-w-0 h-full"><div className="flex items-center justify-between gap-2 bg-zinc-950 text-xs px-2 py-1 shrink-0"><span>{title}</span><button data-testid={target?`dock-${id}`:`detach-${id}`} onClick={target?dock:detach}>{tr(target?'Acoplar':'Desacoplar')} ↗</button></div>{error&&<p role="alert">{tr('Permita ventanas emergentes para desacoplar el panel.')}</p>}<div className="flex flex-1 min-h-0 min-w-0">{children}</div></div>;
  if(!enabled)return <>{children}</>;
  return target?<><div className="p-2 text-xs bg-zinc-950"><button data-testid={`restore-${id}`} onClick={dock}>{title} · {tr('Acoplar')}</button></div>{createPortal(content,target)}</>:content;
}
