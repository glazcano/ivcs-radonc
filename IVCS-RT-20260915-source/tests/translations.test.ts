import test from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readTranslations} from '../server/translations.mjs';
test('translation folder discovers new languages and rejects bad headers and placeholders',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'radcontour-language-'));try{
  const pack={schemaVersion:1,language:{code:'fr',name:'Français',direction:'ltr'},messages:{Guardar:'Enregistrer','Corte {0}':'Coupe {0}'}};
  await fs.writeFile(path.join(dir,'fr.json'),JSON.stringify(pack));let result=await readTranslations(dir);assert.equal(result.translations[0].language.code,'fr');assert.equal(result.warnings.length,0);
  await fs.writeFile(path.join(dir,'invalid.json'),JSON.stringify({...pack,language:{...pack.language,code:'de'},messages:{'Corte {0}':'Schnitt'}}));
  await fs.writeFile(path.join(dir,'duplicate.json'),JSON.stringify(pack));result=await readTranslations(dir);assert.equal(result.translations.length,1);assert.equal(result.warnings.length,2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('bundled Spanish and English catalogues have matching keys and placeholders',async()=>{
 const result=await readTranslations(path.resolve('translations'));assert.deepEqual(result.warnings,[]);const es=result.translations.find(p=>p.language.code==='es'),en=result.translations.find(p=>p.language.code==='en');assert.ok(es && en);assert.deepEqual(Object.keys(es.messages).sort(),Object.keys(en.messages).sort());assert.equal(en.messages.Guardar,'Save');assert.equal(es.messages.Guardar,'Guardar');
});
