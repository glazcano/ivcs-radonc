import {tr} from '../i18n';
import React from 'react';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  RotateCcw,
  Compass,
  Layers,
  Sparkles
} from 'lucide-react';
import { AsymmetricMargin } from '../types';

interface AsymmetricMarginInputsProps {
  margin: AsymmetricMargin;
  onChange: (margin: AsymmetricMargin) => void;
  accent?: 'blue' | 'purple' | 'amber' | 'emerald';
  title?: string;
  compact?: boolean;
}

export const AsymmetricMarginInputs: React.FC<AsymmetricMarginInputsProps> = ({
  margin,
  onChange,
  accent = 'blue',
  title = 'Márgenes en 6 Direcciones (mm)',
  compact = false
}) => {
  const updateDirection = (dir: keyof AsymmetricMargin, value: number) => {
    // Round to 1 decimal place
    const rounded = Math.round(value * 10) / 10;
    onChange({
      ...margin,
      [dir]: rounded
    });
  };

  const handleResetZero = () => {
    onChange({
      superior: 0,
      inferior: 0,
      anterior: 0,
      posterior: 0,
      left: 0,
      right: 0
    });
  };

  const applyPreset = (preset: AsymmetricMargin) => {
    onChange({ ...preset });
  };

  const renderBadge = (val: number) => {
    if (val > 0) {
      return (
        <span className="text-[11px] px-1 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-400 font-mono">
          +{val}{" "}{tr("mm (Exp)")}{" "}</span>
      );
    }
    if (val < 0) {
      return (
        <span className="text-[11px] px-1 py-0.5 rounded bg-amber-950/70 border border-amber-700/50 text-amber-400 font-mono">
          {val}{" "}{tr("mm (Ero)")}{" "}</span>
      );
    }
    return (
      <span className="text-[11px] px-1 py-0.5 rounded bg-[#1A1A1B] text-[#777] font-mono">{" "}{tr("0mm")}{" "}</span>
    );
  };

  return (
    <div className="space-y-2.5 bg-[#0D0D0E] p-3 rounded-lg border border-[#262626]">
      {/* Header with Title and Reset */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#1F1F20]">
        <div className="flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-semibold text-[#E2E2E2]">{title}</span>
        </div>
        <button
          type="button"
          onClick={handleResetZero}
          className="flex items-center gap-1 text-[11px] text-[#888] hover:text-[#E2E2E2] transition px-1.5 py-0.5 rounded hover:bg-[#1C1C1E]"
          title={tr("Restablecer todos los márgenes a 0 mm")}
        >
          <RotateCcw className="w-2.5 h-2.5" />
          <span>{" "}{tr("Todos 0")}{" "}</span>
        </button>
      </div>

      {/* Grid of 3 Anatomical Axes */}
      <div className="space-y-2">
        {/* Z Axis: Superior & Inferior (Cráneo - Caudal) */}
        <div className="bg-[#141416] p-2 rounded border border-[#222]">
          <div className="flex items-center justify-between text-[11px] text-[#888] font-medium mb-1.5">
            <span className="flex items-center gap-1 text-sky-400 font-semibold">
              <Layers className="w-3 h-3" />{" "}{tr("Eje Z (Cráneo-Caudal / Cortes)")}{" "}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Superior */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#AAA] flex items-center gap-1">
                  <ArrowUp className="w-3 h-3 text-sky-400" />
                  <span>{" "}{tr("Arriba (Sup)")}{" "}</span>
                </label>
                {renderBadge(margin.superior)}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="30"
                  value={margin.superior}
                  onChange={(e) => updateDirection('superior', parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] font-mono focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-[#888]">{" "}{tr("mm")}{" "}</span>
              </div>
            </div>

            {/* Inferior */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#AAA] flex items-center gap-1">
                  <ArrowDown className="w-3 h-3 text-sky-400" />
                  <span>{" "}{tr("Abajo (Inf)")}{" "}</span>
                </label>
                {renderBadge(margin.inferior)}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="30"
                  value={margin.inferior}
                  onChange={(e) => updateDirection('inferior', parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] font-mono focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-[#888]">{" "}{tr("mm")}{" "}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Y Axis: Anterior & Posterior */}
        <div className="bg-[#141416] p-2 rounded border border-[#222]">
          <div className="flex items-center justify-between text-[11px] text-[#888] font-medium mb-1.5">
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <Compass className="w-3 h-3" />{" "}{tr("Eje Y (Antero-Posterior)")}{" "}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Anterior */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#AAA] flex items-center gap-1">
                  <ArrowUp className="w-3 h-3 text-emerald-400" />
                  <span>{" "}{tr("Adelante (Ant)")}{" "}</span>
                </label>
                {renderBadge(margin.anterior)}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="30"
                  value={margin.anterior}
                  onChange={(e) => updateDirection('anterior', parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] font-mono focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-[#888]">{" "}{tr("mm")}{" "}</span>
              </div>
            </div>

            {/* Posterior */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#AAA] flex items-center gap-1">
                  <ArrowDown className="w-3 h-3 text-emerald-400" />
                  <span>{" "}{tr("Atrás (Post)")}{" "}</span>
                </label>
                {renderBadge(margin.posterior)}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="30"
                  value={margin.posterior}
                  onChange={(e) => updateDirection('posterior', parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] font-mono focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-[#888]">{" "}{tr("mm")}{" "}</span>
              </div>
            </div>
          </div>
        </div>

        {/* X Axis: Left & Right */}
        <div className="bg-[#141416] p-2 rounded border border-[#222]">
          <div className="flex items-center justify-between text-[11px] text-[#888] font-medium mb-1.5">
            <span className="flex items-center gap-1 text-purple-400 font-semibold">
              <Compass className="w-3 h-3" />{" "}{tr("Eje X (Lateral / Izq-Der)")}{" "}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Left */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#AAA] flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3 text-purple-400" />
                  <span>{" "}{tr("Izquierda (Izq)")}{" "}</span>
                </label>
                {renderBadge(margin.left)}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="30"
                  value={margin.left}
                  onChange={(e) => updateDirection('left', parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] font-mono focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-[#888]">{" "}{tr("mm")}{" "}</span>
              </div>
            </div>

            {/* Right */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#AAA] flex items-center gap-1">
                  <ArrowRight className="w-3 h-3 text-purple-400" />
                  <span>{" "}{tr("Derecha (Der)")}{" "}</span>
                </label>
                {renderBadge(margin.right)}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="30"
                  value={margin.right}
                  onChange={(e) => updateDirection('right', parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0A0A0B] border border-[#333] rounded px-2 py-1 text-xs text-[#E2E2E2] font-mono focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-[#888]">{" "}{tr("mm")}{" "}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clinical Presets for Asymmetric Margins */}
      <div className="pt-2 border-t border-[#1F1F20]">
        <div className="text-[11px] text-[#777] mb-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>{" "}{tr("Presets Clínicos Asimétricos:")}{" "}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => applyPreset({ superior: 7, inferior: 7, anterior: 7, posterior: 4, left: 7, right: 7 })}
            className="px-2 py-1 rounded bg-[#141416] border border-[#2D2D30] hover:border-blue-500 text-[11px] text-[#CCC] hover:text-white transition cursor-pointer"
            title={tr("Próstata PTV: +7mm en todas direcciones excepto +4mm posterior hacia el recto")}
          >{" "}{tr("Próstata (+4 Post / +7 resto)")}{" "}</button>
          <button
            type="button"
            onClick={() => applyPreset({ superior: 10, inferior: 10, anterior: 5, posterior: 5, left: 5, right: 5 })}
            className="px-2 py-1 rounded bg-[#141416] border border-[#2D2D30] hover:border-blue-500 text-[11px] text-[#CCC] hover:text-white transition cursor-pointer"
            title={tr("Tórax / Pulmón: +10mm craneocaudal por movimiento respiratorio, +5mm axial")}
          >{" "}{tr("Tórax (+10 Z / +5 XY)")}{" "}</button>
          <button
            type="button"
            onClick={() => applyPreset({ superior: 3, inferior: 3, anterior: 5, posterior: 3, left: 3, right: 3 })}
            className="px-2 py-1 rounded bg-[#141416] border border-[#2D2D30] hover:border-blue-500 text-[11px] text-[#CCC] hover:text-white transition cursor-pointer"
            title={tr("PRV Médula / Tronco: +3mm perimétrico con +5mm anterior de seguridad")}
          >{" "}{tr("PRV Médula (+5 Ant)")}{" "}</button>
          <button
            type="button"
            onClick={() => applyPreset({ superior: -2, inferior: -2, anterior: -2, posterior: -2, left: -2, right: -2 })}
            className="px-2 py-1 rounded bg-[#141416] border border-[#2D2D30] hover:border-amber-500 text-[11px] text-amber-400 hover:text-amber-300 transition cursor-pointer"
            title={tr("Erosión de 2mm en todas direcciones")}
          >{" "}{tr("Erosión -2mm")}{" "}</button>
        </div>
      </div>
    </div>
  );
};
