import {sessionRecords,readSessionFile,saveChunks} from './utils/sessionStream';
import {trimContourHistory} from './utils/contourHistory';
import {selectBodyReplacement} from './utils/bodyAlgorithms';
import {tr,useLanguage} from './i18n';
import {defaultShortcuts,validShortcuts} from './utils/shortcuts';
import {getPreferences} from './utils/libraryClient';
import {compute} from './utils/computeClient';
import {loadSecondaryStudy} from './utils/libraryClient';
import {WorkflowTools} from './components/WorkflowTools';
import { LibraryMenu } from './components/LibraryMenu';
import { registerStudy, archiveOriginals, openLibraryStudy, libraryIndex, saveRegistrationGroup, LibraryGroup } from './utils/libraryClient';
import { Session, serializeSession, parseSession, saveSession, loadSession } from './utils/session';
import React, { useState, useEffect, useCallback } from 'react';
import {TemporalReview} from './components/TemporalReview';
import { Header } from './components/Header';
import { Viewport } from './components/Viewport';
import { StructurePanel } from './components/StructurePanel';
import { HelpModal } from './components/HelpModal';
import { RegistrationModal } from './components/RegistrationModal';
import { BodyGeneratorModal } from './components/BodyGeneratorModal';
import { MonacoExportModal } from './components/MonacoExportModal';
import { 
  DicomSeries, 
  RoiType, 
  StructureRoi, 
  ToolType, 
  WindowPreset, 
  BooleanOpType,
  ImageStudy,
  RegistrationState,
  RegistrationTransform,
  ContourDrawMode,
  AsymmetricMargin
} from './types';
import { createDemoRadiotherapyDataset } from './utils/demoData';
import { parseMultipleDicomFiles, inspectDicomFiles, ImportSeries } from './utils/dicomParser';
import {DicomImportModal} from './components/DicomImportModal';
import { 
  cloneMask, 
  createEmptyMask, 
  applyBooleanOperationToMasks, 
  generateMarginMask,
  generateAsymmetricMargin2D,
  generateAsymmetricMargin3D,
  isZeroMargin,
  calculateRoiVolumeCm3,
  calculateRoiHuStats,
  interpolateContourGaps,
  interpolateContourRange,
  fillEnclosedHolesOnMask
} from './utils/contourEngine';
import { WINDOW_PRESETS } from './utils/presets';
import { Loader2, AlertCircle, Upload } from 'lucide-react';

export default function App() {
  useLanguage();
  // DICOM & Multimodal Image Studies state
  const [series, setSeries] = useState<DicomSeries | null>(null);
  const [studies, setStudies] = useState<ImageStudy[]>([]);
  const [currentSliceIndex, setCurrentSliceIndex] = useState<number>(0);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Coregistration & Multimodal Fusion state
  const [showRegistrationModal, setShowRegistrationModal] = useState<boolean>(false);
  const [showBodyModal, setShowBodyModal] = useState<boolean>(false);
  const [dicomExportMode,setDicomExportMode]=useState<'rtstruct'|'zip'|'advanced'>('rtstruct');
  const [showMonacoExportModal, setShowMonacoExportModal] = useState<boolean>(false);
  const [registrationState, setRegistrationState] = useState<RegistrationState>({
    active: false,
    referenceStudyId: 'study-ct-primary',
    secondaryStudyId: 'study-pet-choline',
    transforms: {
      'study-pet-choline': {
        translationX: 0,
        translationY: 0,
        translationZ: 0,
        rotationDeg: 0,
        scaleX: 1,
        scaleY: 1,
        locked: false
      },
      'study-mr-t2': {
        translationX: 0,
        translationY: 0,
        translationZ: 0,
        rotationDeg: 0,
        scaleX: 1,
        scaleY: 1,
        locked: false
      }
    },
    fusionMode: 'blend',
    fusionOpacity: 0.55,
    checkerboardSize: 32,
    splitPosition: 0.5,
    secondaryColorMap: 'grayscale',
    secondaryWindowCenter: 120,
    secondaryWindowWidth: 240,
    voi: {
      enabled: false,
      minX: 120,
      maxX: 390,
      minY: 130,
      maxY: 380,
      minSlice: 2,
      maxSlice: 8
    },
    showVoiOverlay: true
  });

  // ROIs (Structures) state
  const [rois, setRois] = useState<StructureRoi[]>([]);
  const [activeRoiId, setActiveRoiId] = useState<string | null>(null);

  // Tools & Windowing state
  const [activeTool, setActiveTool] = useState<ToolType>('brush');
  const [contourDrawMode, setContourDrawMode] = useState<ContourDrawMode>('closed');
  const [brushRadiusMm, setBrushRadiusMm] = useState<number>(5.0);
  const [windowCenter, setWindowCenter] = useState<number>(40);
  const [windowWidth, setWindowWidth] = useState<number>(400);
  const [currentWindowPreset, setCurrentWindowPreset] = useState<string>('Tejido Blando / Pelvis');

  // HU Constraint state
  const [huConstraintEnabled, setHuConstraintEnabled] = useState<boolean>(false);
  const [huConstraintMin, setHuConstraintMin] = useState<number>(0);
  const [huConstraintMax, setHuConstraintMax] = useState<number>(1000);

  // History (Undo / Redo)
  const [undoStack, setUndoStack] = useState<StructureRoi[][]>([]);
  const [redoStack, setRedoStack] = useState<StructureRoi[][]>([]);

  // Loading & Error states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const operationAbort=React.useRef<AbortController|null>(null);
  const [showTemporal,setShowTemporal]=useState(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Helper to snapshot all ROIs using lightweight structural sharing (masks are immutable once created)
  const snapshotRois = useCallback((sourceRois: StructureRoi[]): StructureRoi[] => {
    return sourceRois.map(roi => ({
      ...roi,
      sliceMasks: { ...roi.sliceMasks }
    }));
  }, []);

  const [sessionReady, setSessionReady] = useState(false);
  const [lastSavedAt,setLastSavedAt]=useState('');
  const [saveStatus, setSaveStatus] = useState('Recuperando sesión…');
  const applySession = (saved: Session) => {
    savedContent.current = {rois:saved.rois, registrationState:saved.registrationState};
    setLastSavedAt('');pendingSave.current = false; setSaveStatus(tr("Guardado manual · sin cambios"));
    setSeries(saved.series); setStudies(saved.studies); setRois(saved.rois);
    setCurrentSliceIndex(saved.currentSliceIndex); setActiveRoiId(saved.activeRoiId);
    setWindowCenter(saved.windowCenter); setWindowWidth(saved.windowWidth);
    setRegistrationState(saved.registrationState); setUndoStack([]); setRedoStack([]);
  };
  useEffect(() => {
    let cancelled = false;
    loadSession().then(saved => {
      if (cancelled) return;
      if (saved) applySession(saved);

      setSaveStatus(saved ? 'Sesión recuperada' : 'Lista para guardar');
    }).catch(() => {
      if (!cancelled) { setSaveStatus(tr("Guardado local no disponible")); setErrorMessage(tr("No se pudo recuperar la sesión local. Puede abrir una sesión JSON o cargar DICOM.")); }
    }).finally(()=> { if (!cancelled) setSessionReady(true); });
    return ()=> { cancelled = true; };
  }, []);
  const session = React.useMemo<Session | null>(() => series ? ({
    format: 'radcontour-session', version: 1, series, studies, rois, currentSliceIndex,
    activeRoiId, windowCenter, windowWidth, registrationState
  }) : null, [series, studies, rois, currentSliceIndex, activeRoiId, windowCenter, windowWidth, registrationState]);
  const pendingSave = React.useRef(false);
  const savedContent = React.useRef<{rois:StructureRoi[];registrationState:RegistrationState}|null>(null);
  const saving = React.useRef(false);
  const [isSaving,setIsSaving] = useState(false);
  useEffect(() => {
    if (!sessionReady || !session || isLoading) return;
    pendingSave.current = session.rois !== savedContent.current?.rois || session.registrationState !== savedContent.current?.registrationState;
    if (!saving.current) setSaveStatus(pendingSave.current ? 'Cambios sin guardar' : 'Guardado manual · sin cambios');
  }, [sessionReady, rois, registrationState, isLoading, isSaving]);
  useEffect(()=> {
    const guard = (e: BeforeUnloadEvent)=> { if (pendingSave.current || saving.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload',guard);
    return ()=>window.removeEventListener('beforeunload',guard);
  }, []);
  const flushSession = async () => {
    if (!session || saving.current) return;
    saving.current=true;setIsSaving(true);setSaveStatus(tr("Guardando…"));
    try {
      await saveSession(session);
      savedContent.current={rois:session.rois,registrationState:session.registrationState};
      setLastSavedAt(new Date().toLocaleTimeString());pendingSave.current=false;setSaveStatus(tr("Guardado en carpeta local"));
    } catch(e) {setSaveStatus(tr("No se pudo guardar"));throw e;}
    finally {saving.current=false;setIsSaving(false);}
  };
  const saveManual = () => {void flushSession().catch(e=>setErrorMessage(e.message));};
  useEffect(()=> {
    const key=(e:KeyboardEvent)=>{if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s'){e.preventDefault();if(sessionReady && !isLoading)saveManual();}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[session,sessionReady,isLoading]);
  const [leaveDialog,setLeaveDialog]=useState<{resolve:(choice:string)=>void}|null>(null);
  const confirmLeave = async () => {
    if(saving.current)throw new Error('Espere a que termine el guardado.');
    if(!pendingSave.current)return;
    const choice=await new Promise<string>(resolve=>setLeaveDialog({resolve}));
    if(choice==='cancel')throw new Error('Cambio de caso cancelado.');
    if(choice==='save')await flushSession();
  };
  const handleOpenLibrary = async (key: string, group?: LibraryGroup) => {
    setIsLoading(true); setLoadingMessage(tr("Abriendo estudio local…"));
    try {
      await confirmLeave();
      const saved = await openLibraryStudy(key);
      if (group) {
        const index = await libraryIndex();
        const patient = index.patients.find(p=>p.studies.some(s=>s.key===key))!;
        const secondary = patient.studies.find(s=>s.key===group.members.find(k=>k!==key));
        const transforms = {};
        for (const [k,t] of Object.entries(group.transforms)) {
          const study = patient.studies.find(s=>s.key===k); if (study) transforms[study.id]=t;
        }
        if(secondary && !saved.studies.some(s=>s.id===secondary.id))saved.studies.push(await loadSecondaryStudy(secondary.key));
        if(Object.values(transforms).some((t:any)=>t.model!=='rigid3d'))throw new Error('Este grupo utiliza el antiguo corregistro 2D. Abra las series y cree una alineación 3D nueva.');
        saved.registrationState = {...saved.registrationState,active:true,transforms,detachedSeriesIds:group.detachedSeriesIds,relationPolicies:group.relationPolicies,secondaryStudyId:secondary?.id || saved.registrationState.referenceStudyId};
      }
      applySession(saved); setErrorMessage(null);
    } catch(e) {setErrorMessage((e as Error).message);throw e;}
    finally {setIsLoading(false);}
  };
  const handleOpenSession = async (file: File) => {
    setIsLoading(true);setLoadingMessage(tr("Importando sesión a la biblioteca…"));
    try { const saved = await readSessionFile(file); await confirmLeave(); await saveSession(saved); applySession(saved); setErrorMessage(null); }
    catch (err) { setErrorMessage((err as Error).message); }
    finally {setIsLoading(false);}
  };
  const handleSaveRegistration = async () => {
    if (!session) return;
    try { await flushSession();await saveRegistrationGroup(session);setShowRegistrationModal(false);setSaveStatus(tr("Corregistro guardado en biblioteca")); }
    catch(e) {setErrorMessage((e as Error).message);}
  };

  // Active ROI reference
  const activeRoi = rois.find(r => r.id === activeRoiId) || (rois.length > 0 ? rois[0] : null);

  // Load Demo Dataset Action
  const handleLoadDemo = async () => {
    try {await confirmLeave();} catch {return;}
    setIsLoading(true);
    setLoadingMessage(tr("Cargando TC y RM sintéticas de próstata..."));
    setTimeout(() => {
      const { series: demoSeries, initialRois, studies: demoStudies, registrationState: demoRegistration } = createDemoRadiotherapyDataset();
      setSeries(demoSeries);
      setStudies(demoStudies);
      setRegistrationState(demoRegistration);
      setRois(initialRois);
      setActiveRoiId(initialRois[0].id);
      setCurrentSliceIndex(24);
      setWindowCenter(40);
      setWindowWidth(400);
      setCurrentWindowPreset('Tejido Blando / Pelvis');
      setUndoStack([]);
      setRedoStack([]);
      setIsLoading(false);
    }, 150);
  };

  const [dicomImport,setDicomImport]=useState<ImportSeries[]|null>(null);
  // Keep every imported series and preserve existing contours on re-import.
  const loadDicomSelection = async (files: File[],splitSeriesUIDs=new Set<string>(),selectedKeys?:Set<string>) => {
    setIsLoading(true); setLoadingMessage(tr("Importando DICOM a la biblioteca local…"));setErrorMessage(null);
    try {
      operationAbort.current=new AbortController();
      const parsed = await parseMultipleDicomFiles(files,setLoadingMessage,splitSeriesUIDs,selectedKeys,operationAbort.current?.signal);
      operationAbort.current?.signal.throwIfAborted();operationAbort.current=null;
      const imported: ImageStudy[] = (parsed as any).studies;
      if (!imported?.length || parsed.patientId === 'ID_DESCONOCIDO') throw new Error('Se necesita una ID de paciente DICOM para la biblioteca.');
      const keys: string[] = [];
      for (const study of imported) keys.push(await registerStudy(study));
      setLoadingMessage(tr("Conservando los archivos DICOM originales…"));
      await archiveOriginals(parsed.patientId,files);
      applySession(await openLibraryStudy(keys[0]));
    } catch(e) {setErrorMessage((e as Error).message);}
    finally {setIsLoading(false);operationAbort.current=null;}
  };

  const handleFilesSelected=async(files:File[])=>{
    try{
      await confirmLeave();setIsLoading(true);setErrorMessage(null);
      setLoadingMessage(tr('Analizando series DICOM…'));
      const groups=await inspectDicomFiles(files);
      if(groups.length>1 || groups.some(g=>g.compressed || g.lossy || g.unsupported || g.enhanced)){
        setIsLoading(false);setDicomImport(groups);
      }else await loadDicomSelection(groups[0].files);
    }catch(e){setErrorMessage((e as Error).message);setIsLoading(false);}
  };

  // Shared immutable masks; cap unique history buffers as well as state count.
  const pushUndo = useCallback(() => {
    setUndoStack(prev => trimContourHistory([...prev, snapshotRois(rois)]));
    setRedoStack([]);
  }, [rois, snapshotRois]);

  // Undo Action
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(prev => trimContourHistory([...prev, snapshotRois(rois)]));
    setRois(previous);
    setUndoStack(prev => prev.slice(0, prev.length - 1));
  };

  // Redo Action
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(prev => trimContourHistory([...prev, snapshotRois(rois)]));
    setRois(next);
    setRedoStack(prev => prev.slice(0, prev.length - 1));
  };

  // Update a single slice mask for a given ROI
  const handleUpdateRoiMask = (
    roiId: string, 
    sliceIndex: number, 
    newMask: Uint8Array, 
    _actionName: string
  ) => {
    pushUndo();

    setRois(prev => prev.map(roi => {
      if (roi.id !== roiId) return roi;
      return {
        ...roi,
        sliceMasks: {
          ...roi.sliceMasks,
          [sliceIndex]: newMask
        }
      };
    }));
  };

  // Clear contour of active ROI on current slice
  const handleClearCurrentSliceContour = () => {
    if (!activeRoi || !series || activeRoi.locked) return;
    const slice = series.slices[currentSliceIndex];
    if (!slice) return;

    pushUndo();
    const empty = createEmptyMask(slice.rows, slice.cols);
    setRois(prev => prev.map(roi => {
      if (roi.id !== activeRoi.id) return roi;
      return {
        ...roi,
        sliceMasks: {
          ...roi.sliceMasks,
          [currentSliceIndex]: empty
        }
      };
    }));
  };

  // Fill enclosed holes / interior of active ROI on current slice
  const handleFillEnclosedHoles = () => {
    if (!activeRoi || !series || activeRoi.locked) return;
    const slice = series.slices[currentSliceIndex];
    if (!slice) return;

    const currentMask = activeRoi.sliceMasks[currentSliceIndex];
    if (!currentMask) return;

    pushUndo();
    const filledMask = fillEnclosedHolesOnMask(currentMask, slice.rows, slice.cols);
    setRois(prev => prev.map(roi => {
      if (roi.id !== activeRoi.id) return roi;
      return {
        ...roi,
        sliceMasks: {
          ...roi.sliceMasks,
          [currentSliceIndex]: filledMask
        }
      };
    }));
  };

  // Window preset selection
  const handleApplyWindowPreset = (preset: WindowPreset) => {
    setWindowCenter(preset.center);
    setWindowWidth(preset.width);
    setCurrentWindowPreset(preset.name);
  };

  // ROI management actions
  const handleToggleVisibility = (roiId: string) => {
    setRois(prev => prev.map(r => r.id === roiId ? { ...r, visible: !r.visible } : r));
  };

  const handleToggleLock = (roiId: string) => {
    setRois(prev => prev.map(r => r.id === roiId ? { ...r, locked: !r.locked } : r));
  };

  const handleUpdateOpacity = (roiId: string, opacity: number) => {
    setRois(prev => prev.map(r => r.id === roiId ? { ...r, opacity } : r));
  };

  const handleUpdateColor = (roiId: string, color: string) => {
    setRois(prev => prev.map(r => r.id === roiId ? { ...r, color } : r));
  };

  const handleDeleteRoi = (roiId: string) => {
    if (rois.length <= 1) {
      alert(tr("Debe existir al menos una estructura en el conjunto."));
      return;
    }
    pushUndo();
    setRois(prev => prev.filter(r => r.id !== roiId));
    if (activeRoiId === roiId) {
      const remaining = rois.filter(r => r.id !== roiId);
      if (remaining.length > 0) setActiveRoiId(remaining[0].id);
    }
  };

  const handleDuplicateRoi = (roiId: string) => {
    const src = rois.find(r => r.id === roiId);
    if (!src) return;

    pushUndo();
    const clonedMasks: { [sliceIdx: number]: Uint8Array } = {};
    for (const [sIdx, m] of Object.entries(src.sliceMasks)) {
      if (m) clonedMasks[Number(sIdx)] = cloneMask(m as Uint8Array);
    }

    const duplicated: StructureRoi = {
      ...src,
      id: `roi-${Date.now()}`,
      name: `${src.name}_Copia`,
      sliceMasks: clonedMasks
    };

    setRois(prev => [...prev, duplicated]);
    setActiveRoiId(duplicated.id);
  };

  const handleCreateRoi = (name: string, type: RoiType, color: string) => {
    pushUndo();
    const newRoi: StructureRoi = {
      id: `roi-${Date.now()}`,
      name,
      type,
      color,
      visible: true,
      locked: false,
      opacity: 0.40,
      sliceMasks: {}
    };

    setRois(prev => [...prev, newRoi]);
    setActiveRoiId(newRoi.id);
  };

  // Execute Boolean Operation (with optional asymmetric margins on A and B)
  const handleExecuteBooleanOp = async (
    sourceRoiAId: string,
    operation: BooleanOpType,
    sourceRoiBId: string,
    targetOption: 'new' | 'overwrite_a',
    targetName: string,
    targetColor: string,
    targetType: RoiType,
    scope: 'slice' | 'series',
    marginA?: AsymmetricMargin | null,
    marginB?: AsymmetricMargin | null
  ) => {
    setIsLoading(true);setLoadingMessage(tr("Calculando contornos…"));operationAbort.current=new AbortController();
    try {
    if (!series) return;
    const roiA = rois.find(r => r.id === sourceRoiAId);
    const roiB = rois.find(r => r.id === sourceRoiBId);
    if (!roiA || !roiB) return;

    pushUndo();

    const hasMarginA = marginA && !isZeroMargin(marginA);
    const hasMarginB = marginB && !isZeroMargin(marginB);

    const targetMasks: { [sliceIdx: number]: Uint8Array } = targetOption === 'overwrite_a' 
      ? { ...roiA.sliceMasks } 
      : {};

    if (scope === 'slice') {
      const slice = series.slices[currentSliceIndex];
      if (slice) {
        const sIdx = slice.sliceIndex;
        let maskA = roiA.sliceMasks[sIdx] || createEmptyMask(slice.rows, slice.cols);
        let maskB = roiB.sliceMasks[sIdx] || createEmptyMask(slice.rows, slice.cols);

        if (hasMarginA && marginA) {
          maskA = await compute('generateAsymmetricMargin2D',[maskA, slice.rows, slice.cols, marginA, slice.pixelSpacing],{signal:operationAbort.current?.signal});
        }
        if (hasMarginB && marginB) {
          maskB = await compute('generateAsymmetricMargin2D',[maskB, slice.rows, slice.cols, marginB, slice.pixelSpacing],{signal:operationAbort.current?.signal});
        }

        const opResult = applyBooleanOperationToMasks(maskA, maskB, operation);
        targetMasks[sIdx] = opResult;
      }
    } else {
      // 3D Series
      const volumeA = (hasMarginA && marginA)
        ? await compute('generateAsymmetricMargin3D',[{...series,slices:series.slices.map(s=>({...s,huData:new Int16Array(0)}))}, roiA.sliceMasks, marginA],{signal:operationAbort.current?.signal})
        : roiA.sliceMasks;

      const volumeB = (hasMarginB && marginB)
        ? await compute('generateAsymmetricMargin3D',[{...series,slices:series.slices.map(s=>({...s,huData:new Int16Array(0)}))}, roiB.sliceMasks, marginB],{signal:operationAbort.current?.signal})
        : roiB.sliceMasks;

      for (const slice of series.slices) {
        const sIdx = slice.sliceIndex;
        const maskA = volumeA[sIdx] || createEmptyMask(slice.rows, slice.cols);
        const maskB = volumeB[sIdx] || createEmptyMask(slice.rows, slice.cols);

        const opResult = applyBooleanOperationToMasks(maskA, maskB, operation);
        targetMasks[sIdx] = opResult;
      }
    }

    if (targetOption === 'new') {
      const newRoi: StructureRoi = {
        id: `roi-${Date.now()}`,
        name: targetName,
        type: targetType,
        color: targetColor,
        visible: true,
        locked: false,
        opacity: 0.45,
        sliceMasks: targetMasks
      };
      setRois(prev => [...prev, newRoi]);
      setActiveRoiId(newRoi.id);
    } else {
      setRois(prev => prev.map(r => r.id === sourceRoiAId ? { ...r, sliceMasks: targetMasks } : r));
    }
    } catch(e){setErrorMessage((e as Error).message);}finally{setIsLoading(false);operationAbort.current=null;}
  };
  // Execute Margin Expansion / Erosion (supports 6D asymmetric margins and uniform)
  const handleExecuteMargin = async (
    sourceRoiId: string,
    margin: AsymmetricMargin,
    targetOption: 'new' | 'overwrite',
    targetName: string,
    targetColor: string,
    targetType: RoiType,
    scope: 'slice' | 'series'
  ) => {
    setIsLoading(true);setLoadingMessage(tr("Calculando contornos…"));operationAbort.current=new AbortController();
    try {
    if (!series) return;
    const srcRoi = rois.find(r => r.id === sourceRoiId);
    if (!srcRoi) return;

    if(targetOption==='overwrite' && srcRoi.locked)throw new Error('La estructura está bloqueada.');

    const targetMasks: { [sliceIdx: number]: Uint8Array } = targetOption === 'overwrite' 
      ? { ...srcRoi.sliceMasks } 
      : {};

    if (scope === 'slice') {
      const slice = series.slices[currentSliceIndex];
      if (slice) {
        const sIdx = slice.sliceIndex;
        const srcMask = srcRoi.sliceMasks[sIdx] || createEmptyMask(slice.rows, slice.cols);
        const marginResult = await compute('generateAsymmetricMargin2D',[
          srcMask,
          slice.rows,
          slice.cols,
          margin,
          slice.pixelSpacing
        ],{signal:operationAbort.current?.signal});
        targetMasks[sIdx] = marginResult;
      }
    } else {
      // 3D Series
      const margin3dResult = await compute<Record<number,Uint8Array>>('generateAsymmetricMargin3D',[{...series,slices:series.slices.map(s=>({...s,huData:new Int16Array(0)}))}, srcRoi.sliceMasks, margin],{signal:operationAbort.current?.signal});
      for (const [sIdxStr, m] of Object.entries(margin3dResult)) {
        targetMasks[Number(sIdxStr)] = m;
      }
    }

    pushUndo();
    if(Object.entries(targetMasks).some(([z,m])=>{const sl=series.slices[Number(z)];return sl && m.some((v,i)=>v && (i<sl.cols || i>=m.length-sl.cols || i%sl.cols===0 || i%sl.cols===sl.cols-1 || (scope==='series' && (Number(z)===0 || Number(z)===series.slices.length-1))));}))setErrorMessage(tr("El resultado alcanza el borde del volumen. Revise si el campo de imagen limita el margen."));
    if (targetOption === 'new') {
      const newRoi: StructureRoi = {
        id: `roi-${Date.now()}`,
        name: targetName,
        type: targetType,
        color: targetColor,
        visible: true,
        locked: false,
        opacity: 0.45,
        sliceMasks: targetMasks
      };
      setRois(prev => [...prev, newRoi]);
      setActiveRoiId(newRoi.id);
    } else {
      setRois(prev => prev.map(r => r.id === sourceRoiId ? { ...r, sliceMasks: targetMasks } : r));
    }
    } catch(e){setErrorMessage((e as Error).message);}finally{setIsLoading(false);operationAbort.current=null;}
  };
  // Execute Contour Interpolation across all gaps in ROI
  const handleExecuteInterpolateGaps = async (roiId: string) => {
    setIsLoading(true);setLoadingMessage(tr("Calculando contornos…"));operationAbort.current=new AbortController();
    try {
    if (!series || series.slices.length === 0) return;
    const targetRoi = rois.find(r => r.id === roiId);
    if (!targetRoi) return;

    if (targetRoi.locked) {
      setErrorMessage(tr("La estructura seleccionada está bloqueada."));
      return;
    }

    try {
      const slice0 = series.slices[0];
      const { updatedRoi, interpolatedSlices } = await compute('interpolateContourGaps',[
        targetRoi,
        slice0.rows,
        slice0.cols
      ],{signal:operationAbort.current?.signal});

      pushUndo();
      setRois(prev => prev.map(r => r.id === roiId ? updatedRoi : r));
      setErrorMessage(null);

      // Jump to the first newly interpolated slice
      if (interpolatedSlices.length > 0) {
        setCurrentSliceIndex(interpolatedSlices[0]);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
    } catch(e){setErrorMessage((e as Error).message);}finally{setIsLoading(false);operationAbort.current=null;}
  };
  // Execute Contour Interpolation across a specific slice range
  const handleExecuteInterpolateRange = async (roiId: string, startSlice: number, endSlice: number) => {
    setIsLoading(true);setLoadingMessage(tr("Calculando contornos…"));operationAbort.current=new AbortController();
    try {
    if (!series || series.slices.length === 0) return;
    const targetRoi = rois.find(r => r.id === roiId);
    if (!targetRoi) return;

    if (targetRoi.locked) {
      setErrorMessage(tr("La estructura seleccionada está bloqueada."));
      return;
    }

    try {
      const slice0 = series.slices[0];
      const { updatedRoi, interpolatedSlices } = await compute('interpolateContourRange',[
        targetRoi,
        startSlice,
        endSlice,
        slice0.rows,
        slice0.cols
      ],{signal:operationAbort.current?.signal});

      pushUndo();
      setRois(prev => prev.map(r => r.id === roiId ? updatedRoi : r));
      setErrorMessage(null);

      if (interpolatedSlices.length > 0) {
        setCurrentSliceIndex(interpolatedSlices[0]);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
    } catch(e){setErrorMessage((e as Error).message);}finally{setIsLoading(false);operationAbort.current=null;}
  };
  // Automated BODY / External contour generation handler
  const handleApplyBodyContour = (
    targetMode: 'new' | 'overwrite',
    targetRoiId: string,
    newRoiData: { name: string; color: string },
    scope: 'series' | 'slice',
    sliceMasks: { [sliceIndex: number]: Uint8Array },
    preserveExisting = true
  ) => {
    if (targetMode === 'overwrite') {
      sliceMasks = selectBodyReplacement(rois.find(r => r.id === targetRoiId), sliceMasks, preserveExisting);
    }
    if (!Object.keys(sliceMasks).length) throw new Error('No hay cortes seleccionados para aplicar.');
    pushUndo();

    if (targetMode === 'new') {
      const newRoi: StructureRoi = {
        id: `roi-body-${Date.now()}`,
        name: newRoiData.name.trim() || 'BODY',
        type: 'EXTERNAL',
        color: newRoiData.color || '#00E5FF',
        visible: true,
        locked: false,
        opacity: 0.35,
        sliceMasks: sliceMasks
      };
      setRois(prev => [newRoi, ...prev]);
      setActiveRoiId(newRoi.id);
    } else {
      let resolvedId = targetRoiId;
      setRois(prev => {
        if (!prev.some(r => r.id === targetRoiId && !r.locked)) return prev;

        return prev.map(roi => {
          if (roi.id !== targetRoiId) return roi;
          return {
            ...roi,
            visible: true,
            locked: roi.locked,
            sliceMasks: {
              ...roi.sliceMasks,
              ...sliceMasks
            }
          };
        });
      });
      setActiveRoiId(resolvedId);
    }
  };

  const handleExportRoisJson = async () => {
    if (!session) return;
    try {await saveChunks('IVCS_RT_session.ivcs',sessionRecords(session));}
    catch(e){if((e as Error).name!=='AbortError')alert((e as Error).message);}
  };

  // Export CSV Report
  const handleExportCsvReport = () => {
    if (!series) return;

    const rows = [
      ['Paciente', series.patientName],
      ['ID Paciente', series.patientId],
      ['Estudio', series.studyDescription],
      ['Modalidad', series.modality],
      ['Fecha Reporte', new Date().toLocaleString()],
      [],
      ['Nombre Estructura', 'Tipo ROI', 'Color', 'Volumen (cm³)', 'Vóxeles', 'HU Media', 'HU Mín', 'HU Máx']
    ];

    for (const roi of rois) {
      const stats = calculateRoiHuStats(roi, series.slices);
      rows.push([
        roi.name,
        roi.type,
        roi.color,
        stats.volumeCm3.toString(),
        stats.voxelCount.toString(),
        stats.voxelCount > 0 ? stats.meanHU.toString() : '-',
        stats.voxelCount > 0 ? stats.minHU.toString() : '-',
        stats.voxelCount > 0 ? stats.maxHU.toString() : '-'
      ]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `REPORTE_VOLUMENES_RT_${series.patientId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pixelSpacingMm = series?.slices[currentSliceIndex]?.pixelSpacing[0] || 1.0;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      handleFilesSelected(files);
    }
  };

  const [shortcuts,setShortcuts]=useState(defaultShortcuts);
  const pointerHeld=React.useRef(false);
  useEffect(()=>{const down=()=>{pointerHeld.current=true;},up=()=>{pointerHeld.current=false;};const updated=(e:Event)=>setShortcuts((e as CustomEvent).detail);
    getPreferences().then(p=>{if(validShortcuts(p.shortcuts))setShortcuts(p.shortcuts);}).catch(()=>{});
    window.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);window.addEventListener('blur',up);window.addEventListener('shortcuts-updated',updated);
    return()=>{window.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('blur',up);window.removeEventListener('shortcuts-updated',updated);};
  },[]);
  const temporaryTool=React.useRef<{key:string;tool:ToolType}|null>(null);
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{if(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.repeat || e.ctrlKey || e.metaKey || showRegistrationModal || showHelp || showMonacoExportModal || showBodyModal || leaveDialog || isLoading || pointerHeld.current)return;
      if(e.code==='Space' || e.key==='Alt'){e.preventDefault();if(!temporaryTool.current){temporaryTool.current={key:e.code,tool:activeTool};setActiveTool(e.code==='Space'?'pan':'eraser');}}
    };
    const up=(e:KeyboardEvent)=>{if(temporaryTool.current?.key===e.code){setActiveTool(temporaryTool.current.tool);temporaryTool.current=null;}};
    const blur=()=>{if(temporaryTool.current){setActiveTool(temporaryTool.current.tool);temporaryTool.current=null;}};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[activeTool,showRegistrationModal,showHelp,showMonacoExportModal,showBodyModal,leaveDialog,isLoading]);
  // Global Keyboard Shortcuts (Tool selection, undo/redo, open/closed contouring toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if(document.querySelector('[role="dialog"]') || isLoading || showHelp || leaveDialog || showRegistrationModal || showMonacoExportModal || showBodyModal)return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Contour Mode toggle: 'O'
      if (e.key.toLowerCase() === 'o') {
        setContourDrawMode(prev => (prev === 'closed' ? 'open' : 'closed'));
        return;
      }

      if(e.ctrlKey || e.metaKey || e.altKey || pointerHeld.current)return;
      const chosen=Object.entries(shortcuts).find(([,key])=>key===e.key.toLowerCase());
      if(chosen){e.preventDefault();setActiveTool(chosen[0] as ToolType);}

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, shortcuts, showHelp, isLoading, leaveDialog, showRegistrationModal, showMonacoExportModal, showBodyModal]);

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-screen w-screen bg-[#0A0A0B] text-[#D1D1D1] overflow-hidden font-sans select-none relative"
    >
      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-[#0A0A0B]/90 backdrop-blur-xs border-2 border-dashed border-blue-500 z-50 flex flex-col items-center justify-center pointer-events-none p-6 text-center animate-fade-in">
          <div className="bg-[#111112] border border-[#262626] p-8 rounded-xl flex flex-col items-center gap-3 shadow-2xl max-w-md">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Upload className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-base font-bold text-[#E2E2E2]">{" "}{tr("Suelta tus archivos DICOM o paquete .ZIP")}{" "}</h3>
            <p className="text-xs text-[#888] leading-relaxed">{" "}{tr("La estación de trabajo extraerá automáticamente los cortes axiales, metadatos y calibración radiométrica HU.")}{" "}</p>
          </div>
        </div>
      )}

      {leaveDialog && <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center"><section role="dialog" aria-label={tr("Cambios sin guardar")} className="bg-zinc-900 text-zinc-200 rounded border border-zinc-600 p-6"><h2>{" "}{tr("Hay cambios sin guardar")}{" "}</h2><p className="text-sm my-3">{" "}{tr("¿Cómo desea continuar antes de abrir otro caso?")}{" "}</p><div className="flex gap-3">{[["save",tr("Guardar y continuar")],["discard",tr("Descartar")],["cancel",tr("Cancelar")]].map(([id,label])=><button key={id} className="px-3 py-2 bg-zinc-700 rounded" onClick={()=>{leaveDialog.resolve(id);setLeaveDialog(null);}}>{label}</button>)}</div></section></div>}
      {/* Top Header */}
      <Header activeRoiName={rois.find(r=>r.id===activeRoiId)?.name}
        library={<><LibraryMenu busy={isLoading || !sessionReady} onOpen={handleOpenLibrary} /><button disabled={!series || isLoading} className="px-2 py-1.5 border border-zinc-600 rounded text-xs disabled:opacity-40" onClick={()=>setShowTemporal(true)}>{tr("Revisión 4D")}</button></>}
        series={series}
        currentSliceIndex={currentSliceIndex}
        rois={rois}
        onFilesSelected={handleFilesSelected}
        onOpenSession={handleOpenSession}
        sessionReady={sessionReady}
        saveStatus={tr(saveStatus)+(lastSavedAt?` · ${lastSavedAt}`:'')}
        onSave={saveManual} isSaving={isSaving || isLoading || !series}
        onExportRoisJson={handleExportRoisJson}
        onExportCsvReport={handleExportCsvReport}
        onOpenMonacoExportModal={() => {setDicomExportMode('rtstruct');setShowMonacoExportModal(true);}}
        onShowHelp={() => setShowHelp(true)}
        studiesCount={studies.length}
        onOpenDicomZip={advanced=>{setDicomExportMode(advanced?'advanced':'zip');setShowMonacoExportModal(true);}}
        isRegistrationActive={registrationState.active}
        onOpenRegistrationModal={() => setShowRegistrationModal(true)}
      />

      {showTemporal && series && <TemporalReview rois={rois} onUnion={roi=>{pushUndo();setRois(p=>[...p,roi]);setActiveRoiId(roi.id);}} series={series} sliceIndex={currentSliceIndex} center={windowCenter} width={windowWidth} onClose={()=>setShowTemporal(false)} onOpen={async key=>{await confirmLeave();const saved=await openLibraryStudy(key),z=series.slices[currentSliceIndex].imagePositionPatient![2];saved.currentSliceIndex=saved.series.slices.reduce((best,s,i)=>Math.abs(s.imagePositionPatient![2]-z)<Math.abs(saved.series.slices[best].imagePositionPatient![2]-z)?i:best,0);saved.windowCenter=windowCenter;saved.windowWidth=windowWidth;applySession(saved);}}/>}
      {/* Center Layout: Viewport + Right Structure Panel */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Medical Canvas Viewport */}
        <Viewport onContourDrawModeChange={setContourDrawMode} onFusionOpacityChange={value=>setRegistrationState(p=>({...p,fusionOpacity:value}))} keyboardDisabled={showTemporal || isLoading || !!leaveDialog || showHelp || showRegistrationModal || showMonacoExportModal || showBodyModal}
          series={series}
          currentSliceIndex={currentSliceIndex}
          onSliceChange={setCurrentSliceIndex}
          rois={rois}
          activeRoi={activeRoi}
          activeTool={activeTool}
          onActiveToolChange={setActiveTool}
          contourDrawMode={contourDrawMode}
          brushRadiusMm={brushRadiusMm}
          onBrushRadiusChange={setBrushRadiusMm}
          windowCenter={windowCenter}
          windowWidth={windowWidth}
          onWindowChange={(wc, ww) => {
            setWindowCenter(wc);
            setWindowWidth(ww);
            setCurrentWindowPreset('Personalizado');
          }}
          onUpdateRoiMask={handleUpdateRoiMask}
          huConstraintEnabled={huConstraintEnabled}
          huConstraintMin={huConstraintMin}
          huConstraintMax={huConstraintMax}
          studies={studies}
          registrationState={registrationState}
          onOpenRegistrationModal={() => setShowRegistrationModal(true)}
        />

        {/* Right Panel: Tools, Structure Set, Operations & Stats */}
        <StructurePanel
          workflow={<WorkflowTools series={series} rois={rois} active={activeRoi} z={currentSliceIndex} onJump={setCurrentSliceIndex} onChange={next=>{pushUndo();setRois(next);}}/>}
          onBulkChange={next=>{pushUndo();setRois(next);}} onJump={setCurrentSliceIndex}
          rois={rois}
          activeRoi={activeRoi}
          onSelectRoi={(roi) => setActiveRoiId(roi.id)}
          onToggleVisibility={handleToggleVisibility}
          onToggleLock={handleToggleLock}
          onUpdateOpacity={handleUpdateOpacity}
          onUpdateColor={handleUpdateColor}
          onDeleteRoi={handleDeleteRoi}
          onDuplicateRoi={handleDuplicateRoi}
          onCreateRoi={handleCreateRoi}
          slices={series?.slices || []}
          currentSliceIndex={currentSliceIndex}
          onOpenBodyModal={() => setShowBodyModal(true)}
          onOpenMonacoExportModal={() => {setDicomExportMode('rtstruct');setShowMonacoExportModal(true);}}
          onExecuteBooleanOp={handleExecuteBooleanOp}
          onExecuteMargin={handleExecuteMargin}
          onExecuteInterpolateGaps={handleExecuteInterpolateGaps}
          onExecuteInterpolateRange={handleExecuteInterpolateRange}
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          brushRadiusMm={brushRadiusMm}
          onBrushRadiusChange={setBrushRadiusMm}
          pixelSpacingMm={pixelSpacingMm}
          currentWindowPreset={currentWindowPreset}
          onApplyWindowPreset={handleApplyWindowPreset}
          windowCenter={windowCenter}
          windowWidth={windowWidth}
          onWindowChange={(wc, ww) => {
            setWindowCenter(wc);
            setWindowWidth(ww);
            setCurrentWindowPreset('Personalizado');
          }}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearCurrentSliceContour={handleClearCurrentSliceContour}
          huConstraintEnabled={huConstraintEnabled}
          onToggleHuConstraint={() => setHuConstraintEnabled(!huConstraintEnabled)}
          huConstraintMin={huConstraintMin}
          huConstraintMax={huConstraintMax}
          onChangeHuConstraint={(min, max) => {
            setHuConstraintMin(min);
            setHuConstraintMax(max);
          }}
          contourDrawMode={contourDrawMode}
          onChangeContourDrawMode={setContourDrawMode}
          onFillEnclosedHoles={handleFillEnclosedHoles}
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50">
            <div className="bg-[#111112] border border-[#262626] p-5 rounded-lg shadow-2xl flex items-center gap-3 text-[#E2E2E2]">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-xs font-mono">{" "}{tr(loadingMessage)}{" "}</span>{operationAbort.current && <button className="text-xs border rounded p-2" onClick={()=>operationAbort.current?.abort()}>{" "}{tr("Cancelar cálculo")}{" "}</button>}
            </div>
          </div>
        )}

        {/* Error Toast */}
        {errorMessage && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#1A1111] border border-red-900/80 text-red-300 px-4 py-2.5 rounded shadow-2xl flex items-center gap-2 text-xs z-50 max-w-md">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span className="flex-1">{" "}{tr(errorMessage)}{" "}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white ml-2 cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Multimodal Co-registration & Fusion Modal */}
      {showRegistrationModal && (
        <RegistrationModal
          onSaveGroup={handleSaveRegistration}
          onStudyLoaded={study=>setStudies(prev=>[...prev.filter(s=>s.id!==study.id),study])}
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          studies={studies}
          registrationState={registrationState}
          onUpdateRegistrationState={(updater) => setRegistrationState(updater)}
          currentSliceIndex={currentSliceIndex}
          currentSlice={series?.slices[currentSliceIndex] || null}
          activeRoiName={activeRoi?.name}
          onFitVoiToCurrentSlice={() => {
            setRegistrationState(prev => ({
              ...prev,
              voi: {
                ...prev.voi,
                minSlice: Math.max(0, currentSliceIndex - 2),
                maxSlice: Math.min((series?.slices.length || 1) - 1, currentSliceIndex + 2)
              }
            }));
          }}
        />
      )}

      {/* Automated BODY / External Contour Generator Modal */}
      {showBodyModal && (
        <BodyGeneratorModal
          isOpen={showBodyModal}
          onClose={() => setShowBodyModal(false)}
          series={series}
          currentSliceIndex={currentSliceIndex}
          rois={rois}
          onApplyBodyContour={handleApplyBodyContour}
        />
      )}

      {/* Elekta Monaco DICOM-RTSTRUCT Export Modal */}
      {showMonacoExportModal && (
        <MonacoExportModal
          mode={dicomExportMode}
          studies={studies}
          registration={registrationState}
          isOpen={showMonacoExportModal}
          onClose={() => setShowMonacoExportModal(false)}
          series={series}
          rois={rois}
        />
      )}

      {dicomImport && <DicomImportModal groups={dicomImport} onClose={()=>setDicomImport(null)} onLoad={groups=>{setDicomImport(null);void loadDicomSelection([...new Set(groups.flatMap(g=>g.files))],new Set(groups.filter(g=>g.acquisitionKey).map(g=>g.seriesUID!)),new Set(groups.map(g=>g.key)));}}/>}
      {/* Help Modal */}
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
