import test from 'node:test';
import assert from 'node:assert/strict';
import {trimContourHistory} from '../src/utils/contourHistory';
import {RegistrationHistory} from '../src/utils/registrationHistory';
import {rigidFromDicomMatrix,importSpatialRegistration} from '../src/utils/spatialRegistrationImporter';
import {exportSpatialRegistration,rigidDicomMatrix} from '../src/utils/spatialRegistrationExporter';
import {identity3d,transformPoint} from '../src/utils/rigid3d';
import {createDemoRadiotherapyDataset} from '../src/utils/demoData';
test('History budgets shared buffers once and evicts oldest whole states',()=>{
 const a=new Uint8Array(8),b=new Uint8Array(8),state=(mask:Uint8Array)=>[{sliceMasks:{0:mask}}] as any;
 assert.equal(trimContourHistory([state(a),state(a)],8).length,2);
 assert.equal(trimContourHistory([state(a),state(b)],8).length,1);
 assert.equal(trimContourHistory([state(a)],7).length,0);
});
test('One gesture restores every group transform and detach policy',()=>{
 const history=new RegistrationHistory(),a={transforms:{one:identity3d(),two:identity3d()},relationPolicies:{},detachedSeriesIds:[]} as any;
 const b={...a,transforms:{one:{...identity3d(),translationX:10},two:{...identity3d(),translationX:10}},detachedSeriesIds:['two']};
 history.begin(a);history.commit(a,b);history.end(b);assert.equal(history.past.length,1);
 assert.deepEqual(history.undo(b),a);assert.deepEqual(history.redo(a),b);
});
test('Rigid REG rejects scale/reflection and roundtrips nonidentity direction',()=>{
 const d=createDemoRadiotherapyDataset(),t={...identity3d([12,30,-10]),translationX:17,translationY:-4,rotationY:9,rotationDeg:13};
 const reg=exportSpatialRegistration(d.studies[0],d.studies[1],t);
 const result=importSpatialRegistration(reg.bytes,d.studies[0],d.studies[1]);
 for(const p of [[0,0,0],[20,30,40]] as [number,number,number][])assert.ok(Math.hypot(...transformPoint(p,t).map((v,i)=>v-transformPoint(p,result.transform)[i]))<1e-7);
 const reverse=importSpatialRegistration(reg.bytes,d.studies[1],d.studies[0]);
 assert.ok(Math.hypot(...transformPoint(transformPoint([5,6,7],t),reverse.transform).map((v,i)=>v-[5,6,7][i]))<1e-7);
 const m=rigidDicomMatrix(identity3d());m[0]=2;assert.throws(()=>rigidFromDicomMatrix(m));m[0]=-1;assert.throws(()=>rigidFromDicomMatrix(m));
 assert.throws(()=>importSpatialRegistration(reg.bytes,{...d.studies[0],patientId:'OTHER'},d.studies[1]));
});
