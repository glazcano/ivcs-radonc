import type {RegistrationState,RegistrationTransform} from '../types';
import {identity3d} from './rigid3d';
import {compose,inverse,sameTransform} from './registrationGeometry';
export interface RelationStudy {id:string;key?:string;frameOfReferenceUID?:string;}
export interface RelationGroup {referenceKey:string;transforms:Record<string,RegistrationTransform>;}
export type RelationPolicy='preserve'|'dicom'|'saved'|'single';
export function linkedRelations(nodes:RelationStudy[],groups:RelationGroup[],selected:string,reference:string,detached:string[]=[],policy:RelationPolicy='preserve'){
 const links=new Map<string,{id:string;t:RegistrationTransform}[]>(),conflicts:string[]=[];
 const edge=(a:string,b:string,t:RegistrationTransform)=>{if(detached.includes(a)||detached.includes(b))return;links.set(a,[...(links.get(a)||[]),{id:b,t}]);links.set(b,[...(links.get(b)||[]),{id:a,t:inverse(t)}]);};
 if(policy!=='single'){
 if(policy!=='saved')for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(nodes[i].frameOfReferenceUID && nodes[i].frameOfReferenceUID===nodes[j].frameOfReferenceUID)edge(nodes[i].id,nodes[j].id,identity3d());
 if(policy!=='dicom')for(const g of groups){const a=nodes.find(n=>n.key===g.referenceKey);if(!a || a.id===reference)continue;for(const [key,t] of Object.entries(g.transforms)){const b=nodes.find(n=>n.key===key);if(b && b.id!==reference && t.model==='rigid3d')edge(a.id,b.id,t);}}
 }
 const toSelected:Record<string,RegistrationTransform>={[selected]:identity3d()},queue=[selected];
 for(let i=0;i<queue.length;i++){const id=queue[i];for(const next of links.get(id)||[]){const t=compose(toSelected[id],next.t);if(toSelected[next.id]){if(!sameTransform(toSelected[next.id],t))conflicts.push(next.id);}else{toSelected[next.id]=t;queue.push(next.id);}}}
 return {toSelected,conflicts:[...new Set(conflicts)]};
}
export function relatedInitial(r:RegistrationState,nodes:RelationStudy[],groups:RelationGroup[],selected:string){
 if(r.transforms[selected])return r.transforms[selected];
 const {toSelected}=linkedRelations(nodes,groups,selected,r.referenceStudyId,r.detachedSeriesIds,r.relationPolicies?.[selected]);
 for(const [id,relation] of Object.entries(toSelected)){const t=id===r.referenceStudyId?identity3d():r.transforms[id];if(t)return compose(t,inverse(relation));}
 const direct=groups.find(g=>nodes.find(n=>n.id===r.referenceStudyId)?.key===g.referenceKey)?.transforms[nodes.find(n=>n.id===selected)?.key || ''];
 return direct || identity3d();
}
export function applyRelated(r:RegistrationState,nodes:RelationStudy[],groups:RelationGroup[],selected:string,value:RegistrationTransform,policy:RelationPolicy):RegistrationState{
 const old=relatedInitial(r,nodes,groups,selected);
 if(old.locked && !sameTransform(old,value,1e-8))throw new Error('La transformación seleccionada está bloqueada.');
 const {toSelected,conflicts}=linkedRelations(nodes,groups,selected,r.referenceStudyId,r.detachedSeriesIds,policy);
 if(conflicts.length)throw new Error('Conflicto entre relaciones DICOM y grupos guardados. Elija una política de resolución.');
 if(toSelected[r.referenceStudyId] && !sameTransform(compose(value,toSelected[r.referenceStudyId]),identity3d(),1e-6))throw new Error('El grupo contiene la referencia fija. Desvincule la seleccionada para modificarla.');
 const transforms={...r.transforms};
 for(const [id,relative] of Object.entries(toSelected)){
 if(id===r.referenceStudyId)continue;
 const expected=compose(old,relative),current=r.transforms[id];
 if(id!==selected && current && !sameTransform(current,expected) && policy==='preserve')throw new Error('Las transformaciones actuales contradicen el corregistro relativo. Elija una política de resolución.');
 const next=id===selected?value:compose(value,relative);
 if(current?.locked && !sameTransform(current,next,1e-8))throw new Error('Una serie vinculada está bloqueada. Desbloquéela o desvincule la seleccionada.');
 transforms[id]={...next,locked:id===selected?value.locked:current?.locked || false};
 }
 return {...r,active:true,transforms,relationPolicies:{...r.relationPolicies,...Object.fromEntries(Object.keys(toSelected).filter(id=>id!==r.referenceStudyId).map(id=>[id,policy]))},detachedSeriesIds:policy==='single'?[...new Set([...(r.detachedSeriesIds || []),selected])]:r.detachedSeriesIds};
}
