import {tr} from '../i18n';
import {getPreferences,savePreferences} from '../utils/libraryClient';
import React, { useState } from 'react';
import { 
  Eraser, PenTool, Hexagon, Filter, Move, SunMedium, Ruler,
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  Copy, 
  SlidersHorizontal, 
  Split, 
  Expand, 
  Layers, 
  BarChart3,
  Check,
  RotateCw,
  Workflow,
  UserCheck,
  Paintbrush,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Compass,
  CornerDownRight,
  Maximize2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  BooleanOpType, 
  DicomSlice, 
  RoiType, 
  StructureRoi, 
  ToolType, 
  WindowPreset, 
  ContourDrawMode,
  AsymmetricMargin
} from '../types';
import { RADIOTHERAPY_STRUCTURE_TEMPLATES, ROI_TYPE_COLORS } from '../utils/presets';
import { 
  calculateRoiVolumeCm3, 
  calculateRoiHuStats, 
  getContouredSliceIndices,
  createUniformMargin,
  isZeroMargin
} from '../utils/contourEngine';
import { ToolsPanelSection } from './ToolsPanelSection';
import { AsymmetricMarginInputs } from './AsymmetricMarginInputs';

interface StructurePanelProps {
  onOpenCleanup?:()=>void;
  workflow?:React.ReactNode;
  onBulkChange?:(r:StructureRoi[])=>void;
  onJump?:(z:number)=>void;
  rois: StructureRoi[];
  activeRoi: StructureRoi | null;
  onSelectRoi: (roi: StructureRoi) => void;
  onToggleVisibility: (roiId: string) => void;
  onToggleLock: (roiId: string) => void;
  onUpdateOpacity: (roiId: string, opacity: number) => void;
  onUpdateColor: (roiId: string, color: string) => void;
  onDeleteRoi: (roiId: string) => void;
  onDuplicateRoi: (roiId: string) => void;
  onCreateRoi: (name: string, type: RoiType, color: string) => void;
  slices: DicomSlice[];
  currentSliceIndex?: number;
  onOpenBodyModal?: () => void;
  onOpenMonacoExportModal?: () => void;
  onExecuteBooleanOp: (
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
  ) => void;
  onExecuteMargin: (
    sourceRoiId: string,
    margin: AsymmetricMargin,
    targetOption: 'new' | 'overwrite',
    targetName: string,
    targetColor: string,
    targetType: RoiType,
    scope: 'slice' | 'series'
  ) => void;
  onExecuteInterpolateGaps: (roiId: string) => void;
  onExecuteInterpolateRange: (roiId: string, startSlice: number, endSlice: number) => void;

  // Tool and Viewport Props
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  brushRadiusMm: number;
  onBrushRadiusChange: (radiusMm: number) => void;
  pixelSpacingMm: number;
  currentWindowPreset: string;
  onApplyWindowPreset: (preset: WindowPreset) => void;
  windowCenter: number;
  windowWidth: number;
  onWindowChange?: (wc: number, ww: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearCurrentSliceContour: () => void;
  huConstraintEnabled: boolean;
  onToggleHuConstraint: () => void;
  huConstraintMin: number;
  huConstraintMax: number;
  onChangeHuConstraint: (min: number, max: number) => void;
  contourDrawMode: ContourDrawMode;
  onChangeContourDrawMode: (mode: ContourDrawMode) => void;
  onFillEnclosedHoles?: () => void;
  onResetView?: () => void;
}

export type MainTabType = 'tools' | 'structures' | 'operations' | 'stats';
export type OpSubTabType = 'booleans' | 'margins' | 'interpolation';

export const StructurePanel: React.FC<StructurePanelProps> = React.memo(({
  workflow,onBulkChange,onJump,onOpenCleanup,
  rois,
  activeRoi,
  onSelectRoi,
  onToggleVisibility,
  onToggleLock,
  onUpdateOpacity,
  onUpdateColor,
  onDeleteRoi,
  onDuplicateRoi,
  onCreateRoi,
  slices,
  currentSliceIndex,
  onOpenBodyModal,
  onOpenMonacoExportModal,
  onExecuteBooleanOp,
  onExecuteMargin,
  onExecuteInterpolateGaps,
  onExecuteInterpolateRange,
  activeTool,
  onSelectTool,
  brushRadiusMm,
  onBrushRadiusChange,
  pixelSpacingMm,
  currentWindowPreset,
  onApplyWindowPreset,
  windowCenter,
  windowWidth,
  onWindowChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearCurrentSliceContour,
  huConstraintEnabled,
  onToggleHuConstraint,
  huConstraintMin,
  huConstraintMax,
  onChangeHuConstraint,
  contourDrawMode,
  onChangeContourDrawMode,
  onFillEnclosedHoles,
  onResetView
}) => {
  const [collapsed,setCollapsed]=useState(false),[panelWidth,setPanelWidth]=useState(360),[query,setQuery]=useState(''),[selected,setSelected]=useState<string[]>([]),[grouped,setGrouped]=useState(false),[onlyFavorites,setOnlyFavorites]=useState(false);
  React.useEffect(()=>{getPreferences().then(p=>{if(p.panelWidth)setPanelWidth(Math.max(280,Math.min(560,p.panelWidth)));}).catch(()=>{});},[]);
  const [activeTab, setActiveTab] = useState<MainTabType>('structures');
  const [opSubTab, setOpSubTab] = useState<OpSubTabType>('booleans');

  // New Structure Form State
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newRoiName, setNewRoiName] = useState<string>('Nueva_Estructura');
  const [newRoiType, setNewRoiType] = useState<RoiType>('PTV');
  const [newRoiColor, setNewRoiColor] = useState<string>('#EC4899');

  // Interpolation Form State
  const [selectedInterpRoiId, setSelectedInterpRoiId] = useState<string>('');
  const [interpMode, setInterpMode] = useState<'gaps' | 'range'>('gaps');
  const [userInterpStartSlice, setUserInterpStartSlice] = useState<number | null>(null);
  const [userInterpEndSlice, setUserInterpEndSlice] = useState<number | null>(null);

  // Boolean Operations Form State
  const [boolRoiAId, setBoolRoiAId] = useState<string>('');
  const [boolApplyMarginA, setBoolApplyMarginA] = useState<boolean>(false);
  const [boolMarginModeA, setBoolMarginModeA] = useState<'uniform' | 'asymmetric'>('uniform');
  const [boolUniformMarginA, setBoolUniformMarginA] = useState<number>(5.0);
  const [boolMarginA, setBoolMarginA] = useState<AsymmetricMargin>({
    superior: 5.0,
    inferior: 5.0,
    anterior: 5.0,
    posterior: 5.0,
    left: 5.0,
    right: 5.0
  });

  const [boolOp, setBoolOp] = useState<BooleanOpType>('difference');

  const [boolRoiBId, setBoolRoiBId] = useState<string>('');
  const [boolApplyMarginB, setBoolApplyMarginB] = useState<boolean>(false);
  const [boolMarginModeB, setBoolMarginModeB] = useState<'uniform' | 'asymmetric'>('uniform');
  const [boolUniformMarginB, setBoolUniformMarginB] = useState<number>(3.0);
  const [boolMarginB, setBoolMarginB] = useState<AsymmetricMargin>({
    superior: 3.0,
    inferior: 3.0,
    anterior: 3.0,
    posterior: 3.0,
    left: 3.0,
    right: 3.0
  });

  const [boolTargetOption, setBoolTargetOption] = useState<'new' | 'overwrite_a'>('new');
  const [customBoolTargetName, setCustomBoolTargetName] = useState<string>('');
  const [boolTargetColor, setBoolTargetColor] = useState<string>('#38BDF8');
  const [boolTargetType, setBoolTargetType] = useState<RoiType>('PTV');
  const [boolScope, setBoolScope] = useState<'slice' | 'series'>('series');

  // Margins Form State
  const [marginSourceId, setMarginSourceId] = useState<string>('');
  const [marginIsAsymmetric, setMarginIsAsymmetric] = useState<boolean>(false);
  const [marginMm, setMarginMm] = useState<number>(5.0);
  const [asymmetricMargin, setAsymmetricMargin] = useState<AsymmetricMargin>({
    superior: 5.0,
    inferior: 5.0,
    anterior: 5.0,
    posterior: 5.0,
    left: 5.0,
    right: 5.0
  });
  const [marginTargetOption, setMarginTargetOption] = useState<'new' | 'overwrite'>('new');
  const [customMarginTargetName, setCustomMarginTargetName] = useState<string>('');
  const [marginTargetColor, setMarginTargetColor] = useState<string>('#F43F5E');
  const [marginTargetType, setMarginTargetType] = useState<RoiType>('PTV');
  const [marginScope, setMarginScope] = useState<'slice' | 'series'>('series');

  // Derived effective selection IDs (instant, eliminates cascading useEffect re-render loops on activeRoi selection)
  const effectiveInterpRoiId = (selectedInterpRoiId && rois.some(r => r.id === selectedInterpRoiId))
    ? selectedInterpRoiId
    : (activeRoi?.id || rois[0]?.id || '');

  const effectiveBoolRoiAId = (boolRoiAId && rois.some(r => r.id === boolRoiAId))
    ? boolRoiAId
    : (rois[0]?.id || '');

  const effectiveBoolRoiBId = (boolRoiBId && rois.some(r => r.id === boolRoiBId))
    ? boolRoiBId
    : (rois.length > 1 ? rois[1]?.id : (rois[0]?.id || ''));

  const effectiveMarginSourceId = (marginSourceId && rois.some(r => r.id === marginSourceId))
    ? marginSourceId
    : (activeRoi?.id || rois[0]?.id || '');

  // Only calculate interpolation slice data when interpolation operation is active
  const selectedInterpRoi = (activeTab === 'operations' && opSubTab === 'interpolation')
    ? (rois.find(r => r.id === effectiveInterpRoiId) || null)
    : null;

  const interpContouredSlices = React.useMemo(() => {
    if (!selectedInterpRoi) return [];
    return getContouredSliceIndices(selectedInterpRoi);
  }, [selectedInterpRoi]);

  const detectedGaps = React.useMemo(() => {
    if (activeTab !== 'operations' || opSubTab !== 'interpolation') return [];
    const gaps: { start: number; end: number; count: number }[] = [];
    for (let i = 0; i < interpContouredSlices.length - 1; i++) {
      const sA = interpContouredSlices[i];
      const sB = interpContouredSlices[i + 1];
      if (sB - sA > 1) {
        gaps.push({ start: sA, end: sB, count: sB - sA - 1 });
      }
    }
    return gaps;
  }, [interpContouredSlices, activeTab, opSubTab]);

  const interpStartSlice = (userInterpStartSlice !== null && interpContouredSlices.includes(userInterpStartSlice))
    ? userInterpStartSlice
    : (interpContouredSlices[0] ?? 0);

  const interpEndSlice = (userInterpEndSlice !== null && interpContouredSlices.includes(userInterpEndSlice) && userInterpEndSlice > interpStartSlice)
    ? userInterpEndSlice
    : (interpContouredSlices.length > 1 ? interpContouredSlices[interpContouredSlices.length - 1] : interpStartSlice + 1);

  // Derived suggested names without triggering setState cascades
  const defaultBoolTargetName = React.useMemo(() => {
    const roiA = rois.find(r => r.id === effectiveBoolRoiAId);
    const roiB = rois.find(r => r.id === effectiveBoolRoiBId);
    if (!roiA) return '';
    let opName = 'op';
    if (boolOp === 'union') opName = 'UNION';
    else if (boolOp === 'intersection') opName = 'INTERSEC';
    else if (boolOp === 'difference') opName = 'MENOS';
    else if (boolOp === 'xor') opName = 'XOR';

    let aTag = roiA.name;
    if (boolApplyMarginA) {
      aTag += boolMarginModeA === 'uniform' ? `_${boolUniformMarginA >= 0 ? '+' : ''}${boolUniformMarginA}mm` : '_Asim';
    }
    let bTag = roiB ? roiB.name : 'B';
    if (boolApplyMarginB) {
      bTag += boolMarginModeB === 'uniform' ? `_${boolUniformMarginB >= 0 ? '+' : ''}${boolUniformMarginB}mm` : '_Asim';
    }
    return `${aTag}_${opName}_${bTag}`.substring(0, 30);
  }, [effectiveBoolRoiAId, effectiveBoolRoiBId, boolOp, boolApplyMarginA, boolMarginModeA, boolUniformMarginA, boolApplyMarginB, boolMarginModeB, boolUniformMarginB, rois]);

  const defaultMarginTargetName = React.useMemo(() => {
    const src = rois.find(r => r.id === effectiveMarginSourceId);
    if (!src) return '';
    if (marginIsAsymmetric) {
      return `${src.name}_MargenAsim`.substring(0, 30);
    } else {
      const sign = marginMm >= 0 ? `+${marginMm}` : `${marginMm}`;
      return `${src.name}_${sign}mm`.substring(0, 30);
    }
  }, [effectiveMarginSourceId, marginMm, marginIsAsymmetric, rois]);

  const boolTargetName = customBoolTargetName || defaultBoolTargetName;
  const marginTargetName = customMarginTargetName || defaultMarginTargetName;

  // Memoize ROI volume calculations to prevent expensive voxel loops on every render
  const roiVolumes = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const roi of rois) {
      map[roi.id] = calculateRoiVolumeCm3(roi, slices);
    }
    return map;
  }, [rois, slices]);

  // Compute HU stats ONLY when stats tab is active and only when rois/slices change
  const roiStats = React.useMemo(() => {
    if (activeTab !== 'stats') return {};
    const map: Record<string, ReturnType<typeof calculateRoiHuStats>> = {};
    for (const roi of rois) {
      map[roi.id] = calculateRoiHuStats(roi, slices);
    }
    return map;
  }, [rois, slices, activeTab]);

  // Submit New Structure
  const handleCreateNewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoiName.trim()) return;
    onCreateRoi(newRoiName.trim(), newRoiType, newRoiColor);
    setShowNewModal(false);
    // Reset to generic
    setNewRoiName('Nueva_Estructura');
  };

  // Submit Boolean Operation (with optional asymmetric margins)
  const handleRunBoolean = () => {
    if (!effectiveBoolRoiAId || !effectiveBoolRoiBId) return;
    const finalMarginA = boolApplyMarginA
      ? (boolMarginModeA === 'uniform' ? createUniformMargin(boolUniformMarginA) : boolMarginA)
      : null;
    const finalMarginB = boolApplyMarginB
      ? (boolMarginModeB === 'uniform' ? createUniformMargin(boolUniformMarginB) : boolMarginB)
      : null;

    onExecuteBooleanOp(
      effectiveBoolRoiAId,
      boolOp,
      effectiveBoolRoiBId,
      boolTargetOption,
      boolTargetName || 'Resultado_Booleano',
      boolTargetColor,
      boolTargetType,
      boolScope,
      finalMarginA,
      finalMarginB
    );
    setActiveTab('structures');
  };

  // Submit Margin Expansion/Erosion (supports asymmetric 6D margins)
  const handleRunMargin = () => {
    if (!effectiveMarginSourceId) return;
    const finalMargin = marginIsAsymmetric
      ? asymmetricMargin
      : createUniformMargin(marginMm);

    onExecuteMargin(
      effectiveMarginSourceId,
      finalMargin,
      marginTargetOption,
      marginTargetName || 'Margen_Generado',
      marginTargetColor,
      marginTargetType,
      marginScope
    );
    setActiveTab('structures');
  };

  if(collapsed)return <aside className="w-10 border-l border-zinc-700 bg-zinc-950"><button className="text-blue-200 p-2" title={tr("Mostrar panel")} onClick={()=>setCollapsed(false)}>‹</button></aside>;
  return (
    <aside style={{width:panelWidth}} className=" bg-[#0A0A0B] border-l border-[#262626] flex flex-col h-full text-[#D1D1D1] select-none shrink-0">
      <div className="flex items-center gap-2 px-2 py-1 text-xs border-b border-zinc-700"><button onClick={()=>setCollapsed(true)} title={tr("Ocultar panel")}>{" "}{tr("Ocultar ›")}{" "}</button><input aria-label={tr("Ancho del panel")} className="flex-1 min-w-0" type="range" min="280" max="560" step="10" value={panelWidth} onChange={e=>setPanelWidth(Number(e.target.value))} onPointerUp={()=>void savePreferences({panelWidth}).catch(()=>{})}/></div>
      <div className="flex flex-wrap gap-1 p-2 border-b border-zinc-800">{(["brush","eraser","pencil","polygon","threshold","pan","window","ruler","zoom"] as ToolType[]).map(tool=><button key={tool} id={`btn-contour-tool-${tool}`} title={({brush:tr("Pincel"),eraser:tr("Borrador"),pencil:tr("Lápiz"),polygon:tr("Polígono"),threshold:tr("Umbral conectado"),pan:tr("Desplazar"),window:tr("Ventana"),ruler:tr("Regla"),zoom:tr("Zoom")})[tool]} aria-label={({brush:tr("Pincel"),eraser:tr("Borrador"),pencil:tr("Lápiz"),polygon:tr("Polígono"),threshold:tr("Umbral conectado"),pan:tr("Desplazar"),window:tr("Ventana"),ruler:tr("Regla"),zoom:tr("Zoom")})[tool]} onClick={()=>onSelectTool(tool)} className={'p-2 rounded '+(activeTool===tool?'bg-blue-800 text-white':'bg-zinc-900 text-zinc-300')}>{React.createElement(({brush:Paintbrush,eraser:Eraser,pencil:PenTool,polygon:Hexagon,threshold:Filter,pan:Move,window:SunMedium,ruler:Ruler,zoom:Expand})[tool],{size:16})}</button>)}</div>
      {/* Primary Tab Navigation */}
      <div className="grid grid-cols-4 bg-[#111112] border-b border-[#262626] text-xs font-medium">
        <button
          id="tab-tools"
          onClick={() => setActiveTab('tools')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition cursor-pointer ${
            activeTab === 'tools'
              ? 'border-blue-500 text-blue-400 bg-[#1A1A1B]/40 font-semibold'
              : 'border-transparent text-[#888] hover:text-[#D1D1D1] hover:bg-[#1A1A1B]/20'
          }`}
          title={tr("Herramientas de Contorno y Visor")}
        >
          <Paintbrush className="w-3.5 h-3.5" />
          <span className="text-[11px] truncate px-1">{" "}{tr("Ajustes")}{" "}</span>
        </button>

        <button
          id="tab-structures"
          onClick={() => setActiveTab('structures')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition cursor-pointer ${
            activeTab === 'structures'
              ? 'border-blue-500 text-blue-400 bg-[#1A1A1B]/40 font-semibold'
              : 'border-transparent text-[#888] hover:text-[#D1D1D1] hover:bg-[#1A1A1B]/20'
          }`}
          title={tr("Lista de Estructuras (ROIs)")}
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="text-[11px] truncate px-1">{" "}{tr("Estructuras (")}{" "}{rois.length})</span>
        </button>

        <button
          id="tab-operations"
          onClick={() => setActiveTab('operations')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition cursor-pointer ${
            activeTab === 'operations'
              ? 'border-blue-500 text-blue-400 bg-[#1A1A1B]/40 font-semibold'
              : 'border-transparent text-[#888] hover:text-[#D1D1D1] hover:bg-[#1A1A1B]/20'
          }`}
          title={tr("Operaciones Booleanas, Márgenes e Interpolación")}
        >
          <Split className="w-3.5 h-3.5" />
          <span className="text-[11px] truncate px-1">{" "}{tr("Operaciones")}{" "}</span>
        </button>

        <button
          id="tab-stats"
          onClick={() => setActiveTab('stats')}
          className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition cursor-pointer ${
            activeTab === 'stats'
              ? 'border-blue-500 text-blue-400 bg-[#1A1A1B]/40 font-semibold'
              : 'border-transparent text-[#888] hover:text-[#D1D1D1] hover:bg-[#1A1A1B]/20'
          }`}
          title={tr("Estadísticas de Volúmenes y Radiodensidad HU")}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="text-[11px] truncate px-1">{" "}{tr("Estadísticas")}{" "}</span>
        </button>
      </div>

      {/* Tab 1: Tools (Contour & Viewer) */}
      {activeTab === 'tools' && (
        <ToolsPanelSection
          activeTool={activeTool}
          onSelectTool={onSelectTool}
          brushRadiusMm={brushRadiusMm}
          onBrushRadiusChange={onBrushRadiusChange}
          pixelSpacingMm={pixelSpacingMm}
          activeRoi={activeRoi}
          rois={rois}
          onSelectRoi={onSelectRoi}
          currentWindowPreset={currentWindowPreset}
          onApplyWindowPreset={onApplyWindowPreset}
          windowCenter={windowCenter}
          windowWidth={windowWidth}
          onWindowChange={onWindowChange}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onClearCurrentSliceContour={onClearCurrentSliceContour}
          huConstraintEnabled={huConstraintEnabled}
          onToggleHuConstraint={onToggleHuConstraint}
          huConstraintMin={huConstraintMin}
          huConstraintMax={huConstraintMax}
          onChangeHuConstraint={onChangeHuConstraint}
          contourDrawMode={contourDrawMode}
          onChangeContourDrawMode={onChangeContourDrawMode}
          onFillEnclosedHoles={onFillEnclosedHoles}
          onResetView={onResetView}
        />
      )}

      {/* Tab 2: Structures (ROIs) */}
      {activeTab === 'structures' && (
        <div className="flex-1 flex flex-col overflow-hidden p-3.5 gap-3">
          {/* Top action: Add Structure Button */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#888]">{" "}{tr("Estructuras (")}{" "}{rois.length})
            </span>
            <div className="flex items-center gap-1.5">
              {onOpenBodyModal && (
                <button
                  id="btn-open-body-modal"
                  type="button"
                  onClick={onOpenBodyModal}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-950/60 border border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-900/60 text-cyan-300 text-xs font-medium transition cursor-pointer shadow-sm"
                  title={tr("Generación automatizada de contorno corporal BODY / External (3D o 2D)")}
                >
                  <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{" "}{tr("Auto BODY")}{" "}</span>
                </button>
              )}
              {onOpenMonacoExportModal && (
                <button
                  id="btn-structure-monaco-export"
                  type="button"
                  onClick={onOpenMonacoExportModal}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#1A1A1B] border border-blue-900/60 hover:border-blue-500/80 hover:bg-blue-950/40 text-blue-300 text-xs font-medium transition cursor-pointer shadow-sm"
                  title={tr("Exportar DICOM-RTSTRUCT para TPS (.dcm)")}
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>{" "}{tr("TPS")}{" "}</span>
                </button>
              )}
              <button
                id="btn-add-structure"
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#1A1A1B] border border-[#333] hover:border-[#555] hover:bg-[#262626] text-[#E2E2E2] text-xs font-medium transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-blue-400" />
                <span>{" "}{tr("Nueva")}{" "}</span>
              </button>
            </div>
          </div>

          <div className="space-y-1 text-xs"><input aria-label={tr("Buscar estructuras")} placeholder={tr("Nombre o tipo de ROI…")} className="w-full bg-zinc-900 border border-zinc-700 p-1" value={query} onChange={e=>setQuery(e.target.value)}/><div className="flex flex-wrap gap-2"><label><input type="checkbox" checked={grouped} onChange={e=>setGrouped(e.target.checked)}/>{" "}{tr("Por tipo")}{" "}</label><label><input type="checkbox" checked={onlyFavorites} onChange={e=>setOnlyFavorites(e.target.checked)}/>{" "}{tr("Favoritas")}{" "}</label><button onClick={()=>onBulkChange?.(rois.map(r=>({...r,visible:r.id===activeRoi?.id})))}>{" "}{tr("Solo activa")}{" "}</button><button onClick={()=>onBulkChange?.(rois.map(r=>selected.includes(r.id)?{...r,visible:false}:r))}>{" "}{tr("Ocultar selección (")}{" "}{selected.length})</button><button onClick={()=>onBulkChange?.(rois.map(r=>selected.includes(r.id)?{...r,visible:true}:r))}>{" "}{tr("Mostrar selección")}{" "}</button></div></div>
          {workflow}
          {/* ROI List */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {rois.filter(r=>(r.name+' '+r.type).toLowerCase().includes(query.toLowerCase()) && (!onlyFavorites || r.favorite)).sort((a,b)=>grouped?a.type.localeCompare(b.type):0).map((roi) => {
              const isSelected = activeRoi?.id === roi.id;
              const volume = roiVolumes[roi.id] ?? 0;
              const typeConfig = ROI_TYPE_COLORS[roi.type] || ROI_TYPE_COLORS.OAR;

              return (
                <div
                  key={roi.id}
                  onClick={() => onSelectRoi(roi)}
                  className={`px-2 py-1.5 rounded border transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#1A1A1B] border-blue-500/70 shadow-sm ring-1 ring-blue-500/30'
                      : 'bg-[#111112] border-[#262626] hover:border-[#333] hover:bg-[#1A1A1B]/50'
                  }`}
                >
                  {/* Top line: Color picker, Name, Type Badge, Controls */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input aria-label={tr("Seleccionar ROI ")+roi.name} type="checkbox" checked={selected.includes(roi.id)} onClick={e=>e.stopPropagation()} onChange={e=>setSelected(e.target.checked?[...selected,roi.id]:selected.filter(id=>id!==roi.id))}/>
                      {/* Color Picker Swatch */}
                      <input
                        type="color"
                        value={roi.color}
                        onChange={(e) => onUpdateColor(roi.id, e.target.value)}
                        className="w-3.5 h-3.5 rounded-sm border border-white/30 cursor-pointer p-0 bg-transparent shrink-0"
                        title={tr("Cambiar color del contorno")}
                        onClick={(e) => e.stopPropagation()}
                      />

                      {/* ROI Name */}
                      <span className="font-medium text-xs text-[#E2E2E2] truncate">
                        {roi.name}
                      </span>

                      {/* Type Badge */}
                      <span
                        className={`text-[11px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${typeConfig.badgeBg} ${typeConfig.badgeText}`}
                      >
                        {roi.type}
                      </span>
                    </div>

                    {/* Visibility & Lock toggles */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Visibility button */}
                      <button
                        onClick={() => onToggleVisibility(roi.id)}
                        className={`p-1 rounded hover:bg-[#262626] text-xs transition cursor-pointer ${
                          roi.visible ? 'text-blue-400' : 'text-[#777]'
                        }`}
                        title={roi.visible ? tr("Ocultar contorno") : tr("Mostrar contorno")}
                      >
                        {roi.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      {/* Lock button */}
                      <button
                        onClick={() => onToggleLock(roi.id)}
                        className={`p-1 rounded hover:bg-[#262626] text-xs transition cursor-pointer ${
                          roi.locked ? 'text-amber-400' : 'text-[#777] hover:text-[#888]'
                        }`}
                        title={roi.locked ? tr("Desbloquear edición") : tr("Bloquear contra modificaciones")}
                      >
                        {roi.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>

                      <details className="relative"><summary aria-label={tr("Acciones de ")+roi.name} className="list-none px-2 py-1 cursor-pointer">⋯</summary><div className="absolute right-0 top-full bg-zinc-900 border border-zinc-600 rounded p-1 z-30 min-w-40 flex flex-col text-xs"><button className="p-2 text-left" onClick={()=>{onSelectRoi(roi);window.dispatchEvent(new CustomEvent('roi-workflow',{detail:'rename'}));}}>{tr('Renombrar')}</button><button title={tr("Favorita")} onClick={e=>{e.stopPropagation();onBulkChange?.(rois.map(r=>r.id===roi.id?{...r,favorite:!r.favorite}:r));}}>{roi.favorite?'★':'☆'} {tr('Favorita')}</button><button title={tr("Ir al primer contorno")} onClick={e=>{e.stopPropagation();const z=Object.keys(roi.sliceMasks).map(Number).sort((a,b)=>a-b).find(z=>roi.sliceMasks[z].some(v=>v));if(z!==undefined)onJump?.(z);}}>↗ {tr('Ir al primer contorno')}</button><button className="p-2 text-left" onClick={()=>onDuplicateRoi(roi.id)}>{" "}{tr("Duplicar estructura")}{" "}</button><button className="p-2 text-left text-red-300" disabled={roi.locked} onClick={()=>onDeleteRoi(roi.id)}>{" "}{tr("Eliminar estructura")}{" "}</button>{roi.type==='EXTERNAL' && <button className="p-2 text-left" onClick={onOpenBodyModal}>{" "}{tr("Generar contorno corporal")}{" "}</button>}</div></details>
                    </div>
                  </div>

                  {isSelected && <button className="text-xs text-blue-300 mt-2" onClick={e=>{e.stopPropagation();window.dispatchEvent(new CustomEvent('roi-workflow',{detail:'copy'}));}}>{tr('Copiar contorno')}</button>}
                  {/* Bottom line: Volume in cm3 and Opacity Slider */}
                  {isSelected && <div className="mt-2 flex items-center justify-between text-[11px] text-[#888] pt-1.5 border-t border-[#262626]">
                    <div className="font-mono text-[11px]">{" "}{tr("Volumen:")}{" "}{' '}
                      <span className="text-blue-400 font-semibold">
                        {volume > 0 ? tr("{0} cm³", [volume.toFixed(1)]) : tr("0.0 cm³")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[11px] text-[#888]">{" "}{tr("Opacidad:")}{" "}</span>
                      <input
                        type="range"
                        min="0"
                        max="1.0"
                        step="0.05"
                        value={roi.opacity}
                        onChange={(e) => onUpdateOpacity(roi.id, parseFloat(e.target.value))}
                        className="w-16 h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-blue-500"
                        title={tr("Opacidad del relleno (0% = Solo líneas de contorno)")}
                      />
                      <span className="font-mono text-[11px] w-6 text-right text-[#888]">
                        {Math.round(roi.opacity * 100)}%
                      </span>
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>


        </div>
      )}

      {/* Tab 3: Operations (Boolean, Margins, Interpolation) */}
      {activeTab === 'operations' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <button data-testid="open-cleanup" className="m-2 p-2 border border-blue-800 rounded text-sm disabled:opacity-40" disabled={!activeRoi} onClick={onOpenCleanup}>{tr('Suavizado y limpieza 3D')}</button>
          {/* Sub-tab Navigation */}
          <div className="p-3 pb-0">
            <div className="grid grid-cols-3 bg-[#111112] p-1 rounded-lg border border-[#262626]">
              <button
                id="subtab-booleans"
                type="button"
                onClick={() => setOpSubTab('booleans')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  opSubTab === 'booleans'
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B]'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>{" "}{tr("Booleanas")}{" "}</span>
              </button>

              <button
                id="subtab-margins"
                type="button"
                onClick={() => setOpSubTab('margins')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  opSubTab === 'margins'
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B]'
                }`}
              >
                <Expand className="w-3.5 h-3.5" />
                <span>{" "}{tr("Márgenes")}{" "}</span>
              </button>

              <button
                id="subtab-interpolation"
                type="button"
                onClick={() => setOpSubTab('interpolation')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  opSubTab === 'interpolation'
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-[#888] hover:text-[#E2E2E2] hover:bg-[#1A1A1B]'
                }`}
              >
                <Workflow className="w-3.5 h-3.5" />
                <span>{" "}{tr("Interpolar")}{" "}</span>
              </button>
            </div>
          </div>

          {/* Sub-tab: Contour Interpolation */}
          {opSubTab === 'interpolation' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="space-y-1">
            <h3 className="font-semibold text-[#E2E2E2] text-sm flex items-center gap-1.5">
              <Workflow className="w-4 h-4 text-blue-400" />{" "}{tr("Interpolación de Contornos")}{" "}</h3>
            <p className="text-[11px] text-[#888] leading-relaxed">{" "}{tr("Reconstrucción suave de cortes intermedios mediante campos de distancia con signo (Shape-Based SDF).")}{" "}</p>
          </div>

          {/* Structure Selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Estructura a Interpolar:")}{" "}</label>
            <select
              id="select-interp-roi"
              value={effectiveInterpRoiId}
              onChange={(e) => setSelectedInterpRoiId(e.target.value)}
              className="w-full bg-[#111112] border border-[#333] rounded px-2.5 py-1.5 text-[#E2E2E2] focus:border-blue-500 focus:outline-none cursor-pointer text-xs"
            >
              {rois.map(r => (
                <option key={r.id} value={r.id}>{r.name} [{r.type}]</option>
              ))}
            </select>
          </div>

          {/* Status of Contours in this ROI */}
          <div className="bg-[#111112] p-3 rounded border border-[#262626] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#888] font-semibold">{" "}{tr("Cortes Contorneados:")}{" "}</span>
              <span className="font-mono text-xs text-blue-400 font-bold">
                {interpContouredSlices.length}{" "}{tr("cortes")}{" "}</span>
            </div>

            {interpContouredSlices.length === 0 ? (
              <div className="text-[11px] text-[#888] bg-[#0A0A0B] p-2.5 rounded border border-[#262626] leading-relaxed">{" "}{tr("⚠️ Esta estructura no tiene contornos dibujados. Dibuja al menos dos cortes separados con pincel, lápiz o polígono para poder interpolar.")}{" "}</div>
            ) : interpContouredSlices.length === 1 ? (
              <div className="text-[11px] text-amber-400/90 bg-[#0A0A0B] p-2.5 rounded border border-[#262626] leading-relaxed">{" "}{tr("⚠️ Solo 1 corte contorneado (Corte")}{" "}{interpContouredSlices[0] + 1}{" "}{tr("). Se requieren al menos 2 cortes para realizar interpolación volumétrica.")}{" "}</div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-[#0A0A0B] rounded border border-[#262626]">
                  {interpContouredSlices.map(sIdx => (
                    <span 
                      key={sIdx}
                      className={`px-1.5 py-0.5 rounded border text-[11px] font-mono cursor-pointer transition ${
                        sIdx === currentSliceIndex
                          ? 'bg-blue-600 border-blue-400 text-white font-bold'
                          : 'bg-[#1A1A1B] border-[#333] text-[#D1D1D1] hover:border-[#555]'
                      }`}
                      title={tr("Corte {0} ({1})", [sIdx + 1,selectedInterpRoi?.name])}
                    >{" "}{tr("Corte")}{" "}{sIdx + 1}
                    </span>
                  ))}
                </div>

                {/* Gaps detected notification */}
                {detectedGaps.length > 0 ? (
                  <div className="flex items-center gap-2 p-2 rounded bg-blue-950/30 border border-blue-800/40 text-blue-300 text-[11px]">
                    <span className="font-semibold">{detectedGaps.length}{" "}{tr("brecha(s) detectada(s)")}{" "}</span>
                    <span className="text-[#888]">•</span>
                    <span>{detectedGaps.reduce((acc, g) => acc + g.count, 0)}{" "}{tr("cortes a rellenar")}{" "}</span>
                  </div>
                ) : (
                  <div className="p-2 rounded bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-[11px]">{" "}{tr("✓ No hay brechas intermedias: los cortes existentes son consecutivos.")}{" "}</div>
                )}
              </div>
            )}
          </div>

          {/* Interpolation Controls */}
          {interpContouredSlices.length >= 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 bg-[#0A0A0B] p-1 rounded border border-[#262626]">
                <button
                  type="button"
                  id="btn-mode-gaps"
                  onClick={() => setInterpMode('gaps')}
                  className={`py-1.5 text-xs font-medium rounded transition cursor-pointer ${
                    interpMode === 'gaps' 
                      ? 'bg-[#1A1A1B] text-blue-400 font-bold border border-[#333]' 
                      : 'text-[#888] hover:text-[#D1D1D1]'
                  }`}
                >{" "}{tr("Todas las Brechas")}{" "}</button>
                <button
                  type="button"
                  id="btn-mode-range"
                  onClick={() => setInterpMode('range')}
                  className={`py-1.5 text-xs font-medium rounded transition cursor-pointer ${
                    interpMode === 'range' 
                      ? 'bg-[#1A1A1B] text-blue-400 font-bold border border-[#333]' 
                      : 'text-[#888] hover:text-[#D1D1D1]'
                  }`}
                >{" "}{tr("Rango Específico")}{" "}</button>
              </div>

              {interpMode === 'gaps' ? (
                <div className="space-y-3">
                  <div className="bg-[#111112] p-3 rounded border border-[#262626] space-y-2">
                    <span className="text-[11px] text-[#888] font-semibold">{" "}{tr("Detalle de Brechas:")}{" "}</span>
                    {detectedGaps.length === 0 ? (
                      <div className="text-[11px] text-[#888]">{" "}{tr("Todos los contornos actuales son continuos. Si deseas interpolar entre dos cortes específicos, usa la pestaña \"Rango Específico\".")}{" "}</div>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {detectedGaps.map((g, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px] text-[#D1D1D1] bg-[#0A0A0B] px-2.5 py-1.5 rounded border border-[#262626]">
                            <span>{" "}{tr("Corte")}{" "}{g.start + 1}{" "}{tr("➔ Corte")}{" "}{g.end + 1}</span>
                            <span className="font-mono text-blue-400 font-semibold">{g.count}{" "}{tr("cortes a generar")}{" "}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    id="btn-run-interp-gaps"
                    type="button"
                    onClick={() => {
                      if (!effectiveInterpRoiId) return;
                      onExecuteInterpolateGaps(effectiveInterpRoiId);
                      setActiveTab('structures');
                    }}
                    disabled={detectedGaps.length === 0 || selectedInterpRoi?.locked}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-[#1A1A1B] disabled:text-[#777] disabled:cursor-not-allowed text-white font-medium rounded transition cursor-pointer shadow-sm text-xs flex items-center justify-center gap-1.5"
                  >
                    <Workflow className="w-3.5 h-3.5" />
                    <span>{" "}{tr("Interpolar Todas las Brechas (")}{" "}{detectedGaps.reduce((acc, g) => acc + g.count, 0)}{" "}{tr("cortes)")}{" "}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-[#111112] p-3 rounded border border-[#262626] space-y-3">
                    <span className="text-[11px] text-[#888] font-semibold">{" "}{tr("Seleccionar Extremos del Rango:")}{" "}</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-[#888] block mb-1">{" "}{tr("Corte Inicial (A):")}{" "}</label>
                        <select
                          id="select-interp-start"
                          value={interpStartSlice}
                          onChange={(e) => setUserInterpStartSlice(Number(e.target.value))}
                          className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] cursor-pointer"
                        >
                          {interpContouredSlices.map(sIdx => (
                            <option key={sIdx} value={sIdx}>{" "}{tr("Corte")}{" "}{sIdx + 1}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-[#888] block mb-1">{" "}{tr("Corte Final (B):")}{" "}</label>
                        <select
                          id="select-interp-end"
                          value={interpEndSlice}
                          onChange={(e) => setUserInterpEndSlice(Number(e.target.value))}
                          className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] cursor-pointer"
                        >
                          {interpContouredSlices.map(sIdx => (
                            <option key={sIdx} value={sIdx} disabled={sIdx <= interpStartSlice}>{" "}{tr("Corte")}{" "}{sIdx + 1} {sIdx <= interpStartSlice ? tr("(<= Inicial)") : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="text-[11px] text-[#888] bg-[#0A0A0B] p-2 rounded border border-[#262626]">
                      {interpEndSlice > interpStartSlice ? (
                        <span>{" "}{tr("Se interpolarán suavemente")}{" "}<strong className="text-blue-400">{interpEndSlice - interpStartSlice - 1}</strong>{" "}{tr("cortes entre el corte")}{" "}{interpStartSlice + 1}{" "}{tr("y el corte")}{" "}{interpEndSlice + 1}.</span>
                      ) : (
                        <span className="text-amber-400">{" "}{tr("El corte final debe ser mayor que el inicial.")}{" "}</span>
                      )}
                    </div>
                  </div>

                  <button
                    id="btn-run-interp-range"
                    type="button"
                    onClick={() => {
                      if (!effectiveInterpRoiId) return;
                      onExecuteInterpolateRange(effectiveInterpRoiId, interpStartSlice, interpEndSlice);
                      setActiveTab('structures');
                    }}
                    disabled={interpEndSlice <= interpStartSlice + 1 || selectedInterpRoi?.locked}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-[#1A1A1B] disabled:text-[#777] disabled:cursor-not-allowed text-white font-medium rounded transition cursor-pointer shadow-sm text-xs flex items-center justify-center gap-1.5"
                  >
                    <Workflow className="w-3.5 h-3.5" />
                    <span>{" "}{tr("Interpolar Rango (Corte")}{" "}{interpStartSlice + 1} ➔ {interpEndSlice + 1})</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Technical Info Card */}
          <div className="text-[11px] text-[#888] bg-[#0A0A0B] p-3 rounded border border-[#262626] space-y-1 leading-relaxed">
            <div className="font-semibold text-[#888]">{" "}{tr("Algoritmo Clínico SDF (Signed Distance Fields):")}{" "}</div>
            <div>{" "}{tr("Calcula la distancia bidireccional continua del contorno en cada vóxel. Preserva concavidades anatómicas, bifurcaciones suaves y evita escalonamientos bruscos comunes en la interpolación lineal simple.")}{" "}</div>
          </div>
        </div>
      )}

      {/* Sub-tab: Boolean Operations */}
      {opSubTab === 'booleans' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="space-y-1">
            <h3 className="font-semibold text-[#E2E2E2] text-sm flex items-center gap-1.5">
              <Split className="w-4 h-4 text-blue-400" />{" "}{tr("Operaciones Booleanas")}{" "}</h3>
            <p className="text-[11px] text-[#888]">{" "}{tr("Combina, intersecta o sustrae estructuras para generar nuevos volúmenes objetivo o de protección.")}{" "}</p>
          </div>

          {/* Structure A */}
          <div className="space-y-2">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Estructura A (Principal):")}{" "}</label>
            <select
              id="select-bool-roi-a"
              value={effectiveBoolRoiAId}
              onChange={(e) => setBoolRoiAId(e.target.value)}
              className="w-full bg-[#111112] border border-[#333] rounded px-2.5 py-1.5 text-[#E2E2E2] focus:border-blue-500 focus:outline-none cursor-pointer text-xs"
            >
              {rois.map(r => (
                <option key={r.id} value={r.id}>{r.name} [{r.type}]</option>
              ))}
            </select>

            {/* Optional Margin on Structure A */}
            <div className="bg-[#111112] p-2.5 rounded border border-[#262626] space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#E2E2E2] font-medium">
                  <input
                    type="checkbox"
                    checked={boolApplyMarginA}
                    onChange={(e) => setBoolApplyMarginA(e.target.checked)}
                    className="accent-blue-500 rounded cursor-pointer"
                  />
                  <span>{" "}{tr("Aplicar margen a Estructura A")}{" "}</span>
                </label>
                {boolApplyMarginA && (
                  <span className="text-[11px] text-sky-400 font-mono">
                    {boolMarginModeA === 'uniform' ? tr("{0}{1} mm", [boolUniformMarginA >= 0 ? '+' : '',boolUniformMarginA]) : tr("Asimétrico (6D)")}
                  </span>
                )}
              </div>

              {boolApplyMarginA && (
                <div className="space-y-2 pt-2 border-t border-[#1F1F20]">
                  {/* Mode switch: Uniform vs Asymmetric */}
                  <div className="grid grid-cols-2 gap-1 bg-[#0A0A0B] p-0.5 rounded border border-[#262626] text-[11px]">
                    <button
                      type="button"
                      onClick={() => setBoolMarginModeA('uniform')}
                      className={`py-1 rounded font-medium transition cursor-pointer ${
                        boolMarginModeA === 'uniform' ? 'bg-[#222] text-sky-400 shadow-sm' : 'text-[#777] hover:text-[#CCC]'
                      }`}
                    >{" "}{tr("Uniforme (mm)")}{" "}</button>
                    <button
                      type="button"
                      onClick={() => setBoolMarginModeA('asymmetric')}
                      className={`py-1 rounded font-medium transition cursor-pointer ${
                        boolMarginModeA === 'asymmetric' ? 'bg-[#222] text-sky-400 shadow-sm' : 'text-[#777] hover:text-[#CCC]'
                      }`}
                    >{" "}{tr("Asimétrico (6D)")}{" "}</button>
                  </div>

                  {boolMarginModeA === 'uniform' ? (
                    <div className="space-y-1.5 bg-[#0D0D0E] p-2 rounded border border-[#222]">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#888]">{" "}{tr("Distancia del Margen:")}{" "}</span>
                        <div className="flex items-center gap-1 font-mono text-xs">
                          <input
                            type="number"
                            step="0.5"
                            min="-20"
                            max="30"
                            value={boolUniformMarginA}
                            onChange={(e) => setBoolUniformMarginA(parseFloat(e.target.value) || 0)}
                            className="w-14 bg-[#0A0A0B] border border-[#333] text-sky-400 font-bold px-1.5 py-0.5 rounded text-right"
                          />
                          <span className="text-[11px] text-[#888]">{" "}{tr("mm")}{" "}</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="-15"
                        max="20"
                        step="0.5"
                        value={boolUniformMarginA}
                        onChange={(e) => setBoolUniformMarginA(parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-sky-500"
                      />
                      <div className="flex flex-wrap gap-1 pt-1">
                        {[+3, +5, +7, -3].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setBoolUniformMarginA(v)}
                            className="px-1.5 py-0.5 rounded text-[11px] bg-[#161618] border border-[#333] text-[#888] hover:text-white font-mono cursor-pointer"
                          >
                            {v > 0 ? tr("+{0}mm", [v]) : tr("{0}mm", [v])}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <AsymmetricMarginInputs
                      margin={boolMarginA}
                      onChange={setBoolMarginA}
                      title={tr("Márgenes 6D para Estructura A")}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Operator Grid */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Operador Booleano:")}{" "}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBoolOp('union')}
                className={`p-2 rounded border text-left transition cursor-pointer ${
                  boolOp === 'union'
                    ? 'bg-[#262626] border-blue-500 text-blue-400'
                    : 'bg-[#111112] border-[#262626] text-[#888] hover:border-[#333] hover:text-[#E2E2E2]'
                }`}
              >
                <div className="font-bold text-xs">{" "}{tr("Unión (A ∪ B)")}{" "}</div>
                <div className="text-[11px] text-[#888]">{" "}{tr("Fusión de volúmenes")}{" "}</div>
              </button>

              <button
                type="button"
                onClick={() => setBoolOp('intersection')}
                className={`p-2 rounded border text-left transition cursor-pointer ${
                  boolOp === 'intersection'
                    ? 'bg-[#262626] border-blue-500 text-blue-400'
                    : 'bg-[#111112] border-[#262626] text-[#888] hover:border-[#333] hover:text-[#E2E2E2]'
                }`}
              >
                <div className="font-bold text-xs">{" "}{tr("Intersección (A ∩ B)")}{" "}</div>
                <div className="text-[11px] text-[#888]">{" "}{tr("Zona de solapamiento")}{" "}</div>
              </button>

              <button
                type="button"
                onClick={() => setBoolOp('difference')}
                className={`p-2 rounded border text-left transition cursor-pointer ${
                  boolOp === 'difference'
                    ? 'bg-[#262626] border-blue-500 text-blue-400'
                    : 'bg-[#111112] border-[#262626] text-[#888] hover:border-[#333] hover:text-[#E2E2E2]'
                }`}
              >
                <div className="font-bold text-xs">{" "}{tr("Sustracción (A - B)")}{" "}</div>
                <div className="text-[11px] text-[#888]">{" "}{tr("Remueve B de A")}{" "}</div>
              </button>

              <button
                type="button"
                onClick={() => setBoolOp('xor')}
                className={`p-2 rounded border text-left transition cursor-pointer ${
                  boolOp === 'xor'
                    ? 'bg-[#262626] border-blue-500 text-blue-400'
                    : 'bg-[#111112] border-[#262626] text-[#888] hover:border-[#333] hover:text-[#E2E2E2]'
                }`}
              >
                <div className="font-bold text-xs">{" "}{tr("Dif. Simétrica (XOR)")}{" "}</div>
                <div className="text-[11px] text-[#888]">{" "}{tr("En A o B, no ambos")}{" "}</div>
              </button>
            </div>
          </div>

          {/* Structure B */}
          <div className="space-y-2">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Estructura B (Secundaria):")}{" "}</label>
            <select
              id="select-bool-roi-b"
              value={effectiveBoolRoiBId}
              onChange={(e) => setBoolRoiBId(e.target.value)}
              className="w-full bg-[#111112] border border-[#333] rounded px-2.5 py-1.5 text-[#E2E2E2] focus:border-blue-500 focus:outline-none cursor-pointer text-xs"
            >
              {rois.map(r => (
                <option key={r.id} value={r.id}>{r.name} [{r.type}]</option>
              ))}
            </select>

            {/* Optional Margin on Structure B */}
            <div className="bg-[#111112] p-2.5 rounded border border-[#262626] space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#E2E2E2] font-medium">
                  <input
                    type="checkbox"
                    checked={boolApplyMarginB}
                    onChange={(e) => setBoolApplyMarginB(e.target.checked)}
                    className="accent-blue-500 rounded cursor-pointer"
                  />
                  <span>{" "}{tr("Aplicar margen a Estructura B")}{" "}</span>
                </label>
                {boolApplyMarginB && (
                  <span className="text-[11px] text-purple-400 font-mono">
                    {boolMarginModeB === 'uniform' ? tr("{0}{1} mm", [boolUniformMarginB >= 0 ? '+' : '',boolUniformMarginB]) : tr("Asimétrico (6D)")}
                  </span>
                )}
              </div>

              {boolApplyMarginB && (
                <div className="space-y-2 pt-2 border-t border-[#1F1F20]">
                  {/* Mode switch: Uniform vs Asymmetric */}
                  <div className="grid grid-cols-2 gap-1 bg-[#0A0A0B] p-0.5 rounded border border-[#262626] text-[11px]">
                    <button
                      type="button"
                      onClick={() => setBoolMarginModeB('uniform')}
                      className={`py-1 rounded font-medium transition cursor-pointer ${
                        boolMarginModeB === 'uniform' ? 'bg-[#222] text-purple-400 shadow-sm' : 'text-[#777] hover:text-[#CCC]'
                      }`}
                    >{" "}{tr("Uniforme (mm)")}{" "}</button>
                    <button
                      type="button"
                      onClick={() => setBoolMarginModeB('asymmetric')}
                      className={`py-1 rounded font-medium transition cursor-pointer ${
                        boolMarginModeB === 'asymmetric' ? 'bg-[#222] text-purple-400 shadow-sm' : 'text-[#777] hover:text-[#CCC]'
                      }`}
                    >{" "}{tr("Asimétrico (6D)")}{" "}</button>
                  </div>

                  {boolMarginModeB === 'uniform' ? (
                    <div className="space-y-1.5 bg-[#0D0D0E] p-2 rounded border border-[#222]">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#888]">{" "}{tr("Distancia del Margen:")}{" "}</span>
                        <div className="flex items-center gap-1 font-mono text-xs">
                          <input
                            type="number"
                            step="0.5"
                            min="-20"
                            max="30"
                            value={boolUniformMarginB}
                            onChange={(e) => setBoolUniformMarginB(parseFloat(e.target.value) || 0)}
                            className="w-14 bg-[#0A0A0B] border border-[#333] text-purple-400 font-bold px-1.5 py-0.5 rounded text-right"
                          />
                          <span className="text-[11px] text-[#888]">{" "}{tr("mm")}{" "}</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="-15"
                        max="20"
                        step="0.5"
                        value={boolUniformMarginB}
                        onChange={(e) => setBoolUniformMarginB(parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="flex flex-wrap gap-1 pt-1">
                        {[+3, +5, +7, -3].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setBoolUniformMarginB(v)}
                            className="px-1.5 py-0.5 rounded text-[11px] bg-[#161618] border border-[#333] text-[#888] hover:text-white font-mono cursor-pointer"
                          >
                            {v > 0 ? tr("+{0}mm", [v]) : tr("{0}mm", [v])}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <AsymmetricMarginInputs
                      margin={boolMarginB}
                      onChange={setBoolMarginB}
                      title={tr("Márgenes 6D para Estructura B")}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mathematical Operation Live Formula */}
          <div className="bg-[#111112] p-2.5 rounded border border-[#222] space-y-1">
            <div className="text-[11px] text-[#888] flex items-center gap-1">
              <Compass className="w-3 h-3 text-blue-400" />
              <span>{" "}{tr("Fórmula Resultante:")}{" "}</span>
            </div>
            <div className="font-mono text-xs text-[#E2E2E2] bg-[#0A0A0B] p-2 rounded border border-[#1A1A1B] flex items-center justify-center gap-2 text-center break-all">
              <span className="text-sky-400 font-semibold">
                {rois.find(r => r.id === effectiveBoolRoiAId)?.name || "A"}
                {boolApplyMarginA && (
                  <span className="text-[11px] text-sky-300/80 ml-1">
                    {boolMarginModeA === 'uniform' ? tr("[{0}{1}mm]", [boolUniformMarginA >= 0 ? '+' : '',boolUniformMarginA]) : tr("[6D]")}
                  </span>
                )}
              </span>
              <span className="text-amber-400 font-bold px-1 text-sm">
                {boolOp === 'union' ? '∪' : boolOp === 'intersection' ? '∩' : boolOp === 'difference' ? '−' : '⊕'}
              </span>
              <span className="text-purple-400 font-semibold">
                {rois.find(r => r.id === effectiveBoolRoiBId)?.name || tr("B")}
                {boolApplyMarginB && (
                  <span className="text-[11px] text-purple-300/80 ml-1">
                    {boolMarginModeB === 'uniform' ? tr("[{0}{1}mm]", [boolUniformMarginB >= 0 ? '+' : '',boolUniformMarginB]) : tr("[6D]")}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Destination */}
          <div className="space-y-2 border-t border-[#262626] pt-3">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Destino del Resultado:")}{" "}</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#D1D1D1]">
                <input
                  type="radio"
                  name="boolTargetOption"
                  checked={boolTargetOption === 'new'}
                  onChange={() => setBoolTargetOption('new')}
                  className="accent-blue-500"
                />
                <span>{" "}{tr("Crear Nueva ROI")}{" "}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#D1D1D1]">
                <input
                  type="radio"
                  name="boolTargetOption"
                  checked={boolTargetOption === 'overwrite_a'}
                  onChange={() => setBoolTargetOption('overwrite_a')}
                  className="accent-blue-500"
                />
                <span>{" "}{tr("Sobrescribir A")}{" "}</span>
              </label>
            </div>

            {boolTargetOption === 'new' && (
              <div className="space-y-2 bg-[#111112] p-2.5 rounded border border-[#262626] mt-2">
                <div>
                  <label className="text-[11px] text-[#888] block mb-1">{" "}{tr("Nombre de la nueva ROI:")}{" "}</label>
                  <input
                    type="text"
                    value={boolTargetName}
                    onChange={(e) => setCustomBoolTargetName(e.target.value)}
                    className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-[#E2E2E2] text-xs focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] text-[#888] block mb-1">{" "}{tr("Tipo ROI:")}{" "}</label>
                    <select
                      value={boolTargetType}
                      onChange={(e) => setBoolTargetType(e.target.value as RoiType)}
                      className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] cursor-pointer"
                    >
                      <option value="PTV">{" "}{tr("PTV")}{" "}</option>
                      <option value="CTV">{" "}{tr("CTV")}{" "}</option>
                      <option value="GTV">{" "}{tr("GTV")}{" "}</option>
                      <option value="OAR">{" "}{tr("OAR")}{" "}</option>
                      <option value="PRV">{" "}{tr("PRV")}{" "}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-[#888] block mb-1">{" "}{tr("Color:")}{" "}</label>
                    <input
                      type="color"
                      value={boolTargetColor}
                      onChange={(e) => setBoolTargetColor(e.target.value)}
                      className="w-8 h-6 rounded cursor-pointer border border-[#333] bg-transparent"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Alcance:")}{" "}</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#D1D1D1]">
                <input
                  type="radio"
                  name="boolScope"
                  checked={boolScope === 'series'}
                  onChange={() => setBoolScope('series')}
                  className="accent-blue-500"
                />
                <span>{" "}{tr("Toda la serie (3D)")}{" "}</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#D1D1D1]">
                <input
                  type="radio"
                  name="boolScope"
                  checked={boolScope === 'slice'}
                  onChange={() => setBoolScope('slice')}
                  className="accent-blue-500"
                />
                <span>{" "}{tr("Solo corte actual")}{" "}</span>
              </label>
            </div>
          </div>

          {/* Execute Button */}
          <button
            id="btn-execute-boolean"
            onClick={handleRunBoolean}
            disabled={!effectiveBoolRoiAId || !effectiveBoolRoiBId}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-[#1A1A1B] disabled:text-[#777] text-white font-medium transition cursor-pointer flex items-center justify-center gap-2 rounded shadow-sm"
          >
            <Check className="w-4 h-4" />
            <span>{" "}{tr("Ejecutar Operación Booleana")}{" "}</span>
          </button>
        </div>
      )}

      {/* Sub-tab: Margins (Expansion / Erosion) */}
      {opSubTab === 'margins' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="space-y-1">
            <h3 className="font-semibold text-[#E2E2E2] text-sm flex items-center gap-1.5">
              <Expand className="w-4 h-4 text-blue-400" />{" "}{tr("Generación de Márgenes")}{" "}</h3>
            <p className="text-[11px] text-[#888]">{" "}{tr("Expande o retrae el contorno mediante dilatación / erosión morfológica basada en distancia euclidiana en milímetros.")}{" "}</p>
          </div>

          {/* Source Structure */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Estructura Base (Origen):")}{" "}</label>
            <select
              id="select-margin-source"
              value={effectiveMarginSourceId}
              onChange={(e) => setMarginSourceId(e.target.value)}
              className="w-full bg-[#111112] border border-[#333] rounded px-2.5 py-1.5 text-[#E2E2E2] focus:border-blue-500 focus:outline-none cursor-pointer text-xs"
            >
              {rois.map(r => (
                <option key={r.id} value={r.id}>{r.name} [{r.type}]</option>
              ))}
            </select>
          </div>

          {/* Margin Mode Switch: Uniform vs Asymmetric (6D) */}
          <div className="grid grid-cols-2 gap-1 bg-[#111112] p-1 rounded border border-[#262626] text-xs">
            <button
              type="button"
              onClick={() => setMarginIsAsymmetric(false)}
              className={`py-1.5 rounded font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
                !marginIsAsymmetric ? 'bg-[#222] text-blue-400 shadow-sm' : 'text-[#888] hover:text-[#E2E2E2]'
              }`}
            >
              <Expand className="w-3.5 h-3.5" />
              <span>{" "}{tr("Uniforme (mm)")}{" "}</span>
            </button>
            <button
              type="button"
              onClick={() => setMarginIsAsymmetric(true)}
              className={`py-1.5 rounded font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
                marginIsAsymmetric ? 'bg-[#222] text-blue-400 shadow-sm' : 'text-[#888] hover:text-[#E2E2E2]'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{" "}{tr("Asimétrico (6D)")}{" "}</span>
            </button>
          </div>

          {!marginIsAsymmetric ? (
            /* Margin Distance Slider & Input (Uniform Mode) */
            <div className="space-y-2 bg-[#111112] p-3 rounded border border-[#262626]">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#888]">{" "}{tr("Distancia del Margen:")}{" "}</label>
                <div className="flex items-center gap-1 font-mono text-sm">
                  <input
                    type="number"
                    step="0.5"
                    min="-20"
                    max="30"
                    value={marginMm}
                    onChange={(e) => setMarginMm(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-[#0A0A0B] border border-[#333] text-blue-400 font-bold px-1.5 py-0.5 rounded text-right focus:border-blue-500"
                  />
                  <span className="text-[#888]">{" "}{tr("mm")}{" "}</span>
                </div>
              </div>

              <input
                type="range"
                min="-15"
                max="20"
                step="0.5"
                value={marginMm}
                onChange={(e) => setMarginMm(parseFloat(e.target.value))}
                className="w-full h-1 bg-[#262626] rounded appearance-none cursor-pointer accent-blue-500"
              />

              <div className="flex items-center justify-between text-[11px] font-mono text-[#888]">
                <span>{" "}{tr("-15 mm (Erosión)")}{" "}</span>
                <span className="text-blue-400 font-medium">
                  {marginMm > 0 ? tr("+{0} mm (Expansión)", [marginMm]) : marginMm < 0 ? tr("{0} mm (Erosión)", [marginMm]) : tr("0 mm")}
                </span>
                <span>{" "}{tr("+20 mm (Expansión)")}{" "}</span>
              </div>

              {/* Clinical Presets */}
              <div className="pt-2 border-t border-[#262626]">
                <div className="text-[11px] text-[#888] mb-1.5">{" "}{tr("Presets Clínicos:")}{" "}</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: tr("+3 mm (PRV Médula)"), val: 3.0 },
                    { label: tr("+5 mm (CTV → PTV)"), val: 5.0 },
                    { label: tr("+7 mm (PTV Estándar)"), val: 7.0 },
                    { label: tr("+10 mm (Planificación)"), val: 10.0 },
                    { label: tr("-3 mm (Contracción)"), val: -3.0 }
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setMarginMm(p.val)}
                      className={`px-2 py-1 rounded text-[11px] transition cursor-pointer font-mono ${
                        marginMm === p.val
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-[#0A0A0B] border border-[#333] text-[#888] hover:text-white hover:border-[#555]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Asymmetric Margins 6-Directional Inputs */
            <AsymmetricMarginInputs
              margin={asymmetricMargin}
              onChange={setAsymmetricMargin}
              title={tr("Márgenes Asimétricos (6 Direcciones)")}
            />
          )}

          {/* Destination */}
          <div className="space-y-2 border-t border-[#262626] pt-3">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Destino:")}{" "}</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#D1D1D1]">
                <input
                  type="radio"
                  name="marginTargetOption"
                  checked={marginTargetOption === 'new'}
                  onChange={() => setMarginTargetOption('new')}
                  className="accent-blue-500"
                />
                <span>{" "}{tr("Crear Nueva ROI")}{" "}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#D1D1D1]">
                <input
                  type="radio"
                  name="marginTargetOption"
                  checked={marginTargetOption === 'overwrite'}
                  onChange={() => setMarginTargetOption('overwrite')}
                  className="accent-blue-500"
                />
                <span>{" "}{tr("Sobrescribir Origen")}{" "}</span>
              </label>
            </div>

            {marginTargetOption === 'new' && (
              <div className="space-y-2 bg-[#111112] p-2.5 rounded border border-[#262626] mt-2">
                <div>
                  <label className="text-[11px] text-[#888] block mb-1">{" "}{tr("Nombre de la ROI generada:")}{" "}</label>
                  <input
                    type="text"
                    value={marginTargetName}
                    onChange={(e) => setCustomMarginTargetName(e.target.value)}
                    className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-[#E2E2E2] text-xs focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] text-[#888] block mb-1">{" "}{tr("Tipo ROI:")}{" "}</label>
                    <select
                      value={marginTargetType}
                      onChange={(e) => setMarginTargetType(e.target.value as RoiType)}
                      className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] cursor-pointer"
                    >
                      <option value="PTV">{" "}{tr("PTV")}{" "}</option>
                      <option value="CTV">{" "}{tr("CTV")}{" "}</option>
                      <option value="PRV">{" "}{tr("PRV")}{" "}</option>
                      <option value="GTV">{" "}{tr("GTV")}{" "}</option>
                      <option value="OAR">{" "}{tr("OAR")}{" "}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-[#888] block mb-1">{" "}{tr("Color:")}{" "}</label>
                    <input
                      type="color"
                      value={marginTargetColor}
                      onChange={(e) => setMarginTargetColor(e.target.value)}
                      className="w-8 h-6 rounded cursor-pointer border border-[#333] bg-transparent"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-[#888]">{" "}{tr("Alcance:")}{" "}</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#D1D1D1]">
                <input
                  type="radio"
                  name="marginScope"
                  checked={marginScope === 'series'}
                  onChange={() => setMarginScope('series')}
                  className="accent-blue-500"
                />
                <span>{" "}{tr("Toda la serie (3D)")}{" "}</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#D1D1D1]">
                <input
                  type="radio"
                  name="marginScope"
                  checked={marginScope === 'slice'}
                  onChange={() => setMarginScope('slice')}
                  className="accent-blue-500"
                />
                <span>{" "}{tr("Solo corte actual")}{" "}</span>
              </label>
            </div>
          </div>

          {/* Execute Button */}
          <button
            id="btn-execute-margin"
            onClick={handleRunMargin}
            disabled={!effectiveMarginSourceId || marginMm === 0}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-[#1A1A1B] disabled:text-[#777] text-white font-medium transition cursor-pointer flex items-center justify-center gap-2 rounded shadow-sm"
          >
            <Check className="w-4 h-4" />
            <span>{" "}{tr("Generar Margen de")}{" "}{marginMm > 0 ? `+${marginMm}` : marginMm}{" "}{tr("mm")}{" "}</span>
          </button>
        </div>
      )}
        </div>
      )}

      {/* Tab 4: Statistics & Volume Table */}
      {activeTab === 'stats' && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
          <div className="space-y-1">
            <h3 className="font-semibold text-[#E2E2E2] text-sm flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-blue-400" />{" "}{tr("Reporte Volumétrico y Densidad")}{" "}</h3>
            <p className="text-[11px] text-[#888]">{" "}{tr("Volúmenes en cm³ y estadísticas HU calculadas sobre el espaciado de vóxel del TAC.")}{" "}</p>
          </div>

          <div className="space-y-2">
            {rois.map((roi) => {
              const stats = roiStats[roi.id] || { minHU: 0, maxHU: 0, meanHU: 0, voxelCount: 0, volumeCm3: 0 };
              const typeConfig = ROI_TYPE_COLORS[roi.type] || ROI_TYPE_COLORS.OAR;

              return (
                <div key={roi.id} className="bg-[#111112] p-2.5 rounded border border-[#262626] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: roi.color }} />
                      <span className="font-medium text-[#E2E2E2]">{roi.name}</span>
                    </div>
                    <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded border ${typeConfig.badgeBg} ${typeConfig.badgeText}`}>
                      {roi.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-[#0A0A0B] p-2 rounded border border-[#262626]">
                    <div>
                      <span className="text-[#888]">{" "}{tr("Volumen:")}{" "}</span>
                      <span className="text-blue-400 font-semibold">{stats.volumeCm3}{" "}{tr("cm³")}{" "}</span>
                    </div>
                    <div>
                      <span className="text-[#888]">{" "}{tr("VOXELS:")}{" "}</span>
                      <span className="text-[#D1D1D1]">{stats.voxelCount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[#888]">{" "}{tr("MEAN HU:")}{" "}</span>
                      <span className="text-[#D1D1D1]">
                        {stats.voxelCount > 0 ? tr("{0} HU", [stats.meanHU]) : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#888]">{" "}{tr("RANGE:")}{" "}</span>
                      <span className="text-[#D1D1D1]">
                        {stats.voxelCount > 0 ? `[${stats.minHU}, ${stats.maxHU}]` : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Add New Structure Template */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#111112] border border-[#333] rounded-lg max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <h3 className="font-semibold text-sm text-[#E2E2E2] flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />{" "}{tr("Nueva Estructura de Radioterapia")}{" "}</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-[#888] hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Predefined Templates */}
            <div>
              <label className="block text-[11px] text-[#888] mb-1.5">{" "}{tr("Plantillas Clínicas Rápidas (TG-263):")}{" "}</label>
              <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                {RADIOTHERAPY_STRUCTURE_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.name}
                    type="button"
                    onClick={() => {
                      setNewRoiName(tmpl.name);
                      setNewRoiType(tmpl.type);
                      setNewRoiColor(tmpl.color);
                    }}
                    className="flex items-center gap-2 p-1.5 rounded bg-[#0A0A0B] hover:bg-[#1A1A1B] border border-[#262626] hover:border-[#333] text-left transition cursor-pointer"
                  >
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: tmpl.color }} />
                    <span className="truncate font-mono text-[11px] text-[#D1D1D1]">{tmpl.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateNewSubmit} className="space-y-3 pt-2 border-t border-[#262626]">
              <div>
                <label className="block text-[11px] text-[#888] mb-1">{" "}{tr("Nombre de la Estructura:")}{" "}</label>
                <input
                  type="text"
                  value={newRoiName}
                  onChange={(e) => setNewRoiName(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2.5 py-1.5 text-[#E2E2E2] font-mono focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#888] mb-1">{" "}{tr("Tipo de ROI:")}{" "}</label>
                  <select
                    value={newRoiType}
                    onChange={(e) => setNewRoiType(e.target.value as RoiType)}
                    className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2.5 py-1.5 text-[#D1D1D1] cursor-pointer text-xs"
                  >
                    <option value="PTV">{" "}{tr("PTV (Target Planificado)")}{" "}</option>
                    <option value="CTV">{" "}{tr("CTV (Target Clínico)")}{" "}</option>
                    <option value="GTV">{" "}{tr("GTV (Tumor Macroscópico)")}{" "}</option>
                    <option value="OAR">{" "}{tr("OAR (Órgano en Riesgo)")}{" "}</option>
                    <option value="PRV">{" "}{tr("PRV (Margen de OAR)")}{" "}</option>
                    <option value="EXTERNAL">{" "}{tr("EXTERNAL (Contorno)")}{" "}</option>
                    <option value="SUPPORT">{" "}{tr("SUPPORT (Mesa/Inmov)")}{" "}</option>
                    <option value="AVOIDANCE">{" "}{tr("AVOIDANCE (Evitación)")}{" "}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#888] mb-1">{" "}{tr("Color del Contorno:")}{" "}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newRoiColor}
                      onChange={(e) => setNewRoiColor(e.target.value)}
                      className="w-9 h-7 rounded border border-[#333] bg-transparent cursor-pointer"
                    />
                    <span className="font-mono text-[#888] text-xs">{newRoiColor}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#262626]">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 rounded bg-[#1A1A1B] border border-[#333] hover:border-[#555] text-[#D1D1D1] transition cursor-pointer"
                >{" "}{tr("Cancelar")}{" "}</button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition cursor-pointer shadow-sm"
                >{" "}{tr("Crear Estructura")}{" "}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
});
