import type {DicomSlice,ImageStudy,StructureRoi,RegistrationState} from '../types';
import {identity3d} from './rigid3d';

/** Procedural phantom only: no source images or clinical records are used. */
export function createDemoRadiotherapyDataset(){
  const n=256,depth=64,spacing=1.5,dz=2.5,base='2.25.202609090012345678901234567890';
  const studies:ImageStudy[]=['CT','MR'].map((modality,i)=>({id:'synthetic-'+modality,patientId:'SYNTHETIC-LB-20260909',patientName:'Bello^Luciano',modality,
    studyDescription:'SYNTHETIC prostate radiotherapy demonstration',seriesDescription:'SIMULATED '+(i?'T2 MRI pelvis':'CT pelvis')+' - NOT FOR CLINICAL USE',
    studyInstanceUID:base+'.1',seriesInstanceUID:base+'.'+(i+2),frameOfReferenceUID:base+'.4',studyDate:'20260909',date:'2026-09-09',slices:[],defaultWindowCenter:i?400:40,defaultWindowWidth:i?800:400,colorMap:'grayscale'}));
  const specs=[['CTV_Prostate','CTV','#fb923c'],['PTV_Demo_5mm','PTV','#ef4444'],['Bladder','OAR','#eab308'],['Rectum','OAR','#a855f7'],['FemoralHead_L','OAR','#22c55e'],['FemoralHead_R','OAR','#06b6d4'],['SeminalVesicles','OAR','#f472b6'],['BODY','EXTERNAL','#3b82f6']];
  const initialRois:StructureRoi[]=specs.map(([name,type,color],i)=>({id:'synthetic-roi-'+i,name,type:type as StructureRoi['type'],color,visible:i<7,locked:false,opacity:.18,sliceMasks:{}}));
  const ell=(x:number,y:number,z:number,cx:number,cy:number,cz:number,rx:number,ry:number,rz:number)=>((x-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2;
  for(let k=0;k<depth;k++){
    const z=-80+k*dz,ct=new Int16Array(n*n),mr=new Int16Array(n*n),masks=specs.map(()=>new Uint8Array(n*n));
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){
      const i=r*n+c,x=-192+c*spacing,y=-192+r*spacing;
      const shape=(x/(148+6*Math.cos(z/40)))**2+(y/(98+4*Math.sin(z/35)))**2;
      const prostate=ell(x,y,z,0,8,-20,22,18,20)<=1,ptv=ell(x,y,z,0,8,-20,27,23,25)<=1;
      const bladder=ell(x,y,z,0,-12,27,37,31,38)<=1,rectum=ell(x,y,z,0,43,-16,13,14,64)<=1;
      const left=ell(x,y,z,94,0,-35,25,26,30),right=ell(x,y,z,-94,0,-35,25,26,30);
      const sv=ell(x,y,z,17,20,4,8,10,15)<=1 || ell(x,y,z,-17,20,4,8,10,15)<=1;
      let hu=-1000,signal=0;
      if(shape<=1){hu=shape>.87?-95:35;signal=shape>.87?520:180;
        if(Math.abs(x)>55 && Math.abs(x)<115 && Math.abs(y)<55){hu=48;signal=120;}
        const ilium=Math.min(ell(x,y,z,112,22,30,25,43,60),ell(x,y,z,-112,22,30,25,43,60));
        const sacrum=ell(x,y,z,0, 70,30,32,15,55);
        const bone=Math.min(left,right,ilium,sacrum);
        if(bone<=1){hu=bone>.73?1050:220;signal=bone>.73?15:340;}
        if(rectum){hu=45;signal=250;if(ell(x,y,z,0,43,-16,8,9,62)<1){hu=-850;signal=12;}}
        if(bladder){hu=12;signal=850;}
        if(sv){hu=42;signal=530;}
        if(prostate){hu=48;signal=ell(x,y,z,0,8,-20,13,11,17)<1?240:390;}
        const noise=((Math.imul(i+1,1103515245)^Math.imul(k+1,12345))>>>0)%23-11;
        hu+=noise;signal=Math.max(0,signal+noise*2+Math.round(10*Math.sin(x*.25)*Math.cos(y*.2)));
      }
      ct[i]=hu;mr[i]=signal;
      [prostate,ptv,bladder,rectum,left<=1,right<=1,sv,shape<=1].forEach((v,j)=>{masks[j][i]=v?1:0;});
    }
    for(let j=0;j<masks.length;j++)if(masks[j].some(v=>v))initialRois[j].sliceMasks[k]=masks[j];
    for(let j=0;j<2;j++){
      const slice:DicomSlice={id:studies[j].id+'-'+k,sliceIndex:k,rows:n,cols:n,pixelSpacing:[spacing,spacing],sliceThickness:dz,sliceLocation:z,
        imagePositionPatient:[-192,-192,z],imageOrientationPatient:[1,0,0,0,1,0],huData:j?mr:ct,minHU:j?0:-1000,maxHU:j?900:1100,
        windowCenter:j?400:40,windowWidth:j?800:400,rescaleSlope:1,rescaleIntercept:0,sopInstanceUID:base+'.'+(j+2)+'.'+(k+1),sopClassUID:j?'1.2.840.10008.5.1.4.1.1.4':'1.2.840.10008.5.1.4.1.1.2'};
      studies[j].slices.push(slice);
    }
  }
  const registrationState:RegistrationState={active:true,referenceStudyId:studies[0].id,secondaryStudyId:studies[1].id,transforms:{[studies[1].id]:identity3d([0,0,0])},fusionMode:'blend',fusionOpacity:.35,checkerboardSize:24,splitPosition:.5,voi:{enabled:false,minX:0,maxX:n-1,minY:0,maxY:n-1,minSlice:0,maxSlice:depth-1},showVoiOverlay:false,secondaryWindowCenter:400,secondaryWindowWidth:800,secondaryColorMap:'grayscale'};
  return {series:studies[0],studies,initialRois,registrationState};
}

