import { RoiType, WindowPreset } from '../types';

export const WINDOW_PRESETS: WindowPreset[] = [
  { name: 'Tejido Blando / Pelvis', center: 40, width: 400, description: 'Óptimo para visualización de órganos pélvicos y abdominales' },
  { name: 'Pulmón', center: -600, width: 1500, description: 'Visualización del parénquima pulmonar y bronquios' },
  { name: 'Hueso (Bone)', center: 300, width: 2000, description: 'Estructuras óseas corticales y trabeculares' },
  { name: 'Cerebro / Encéfalo', center: 40, width: 80, description: 'Diferenciación de sustancia gris y blanca' },
  { name: 'Hígado / Abdomen', center: 60, width: 150, description: 'Contraste para lesiones hepáticas' },
  { name: 'Amplio Completo', center: 0, width: 2500, description: 'Rango completo de densidades radiológicas' }
];

export interface StructureTemplate {
  name: string;
  type: RoiType;
  color: string;
}

export const RADIOTHERAPY_STRUCTURE_TEMPLATES: StructureTemplate[] = [
  { name: 'PTV_70Gy', type: 'PTV', color: '#EF4444' },
  { name: 'CTV_T_Primary', type: 'CTV', color: '#F97316' },
  { name: 'GTV_Tumor', type: 'GTV', color: '#DC2626' },
  { name: 'PTV_Elective_50Gy', type: 'PTV', color: '#FB923C' },
  { name: 'Vejiga (Bladder)', type: 'OAR', color: '#EAB308' },
  { name: 'Recto (Rectum)', type: 'OAR', color: '#A855F7' },
  { name: 'Cabezas_Femorales', type: 'OAR', color: '#10B981' },
  { name: 'Medula_Espinal (Cord)', type: 'OAR', color: '#06B6D4' },
  { name: 'PRV_Medula_3mm', type: 'PRV', color: '#38BDF8' },
  { name: 'Intestino_Delgado', type: 'OAR', color: '#F472B6' },
  { name: 'Pulmon_Izquierdo', type: 'OAR', color: '#34D399' },
  { name: 'Pulmon_Derecho', type: 'OAR', color: '#2DD4BF' },
  { name: 'Corazon (Heart)', type: 'OAR', color: '#E11D48' },
  { name: 'Parotidas', type: 'OAR', color: '#6366F1' },
  { name: 'Body_External', type: 'EXTERNAL', color: '#3B82F6' },
  { name: 'Mesa_Soporte (Table)', type: 'SUPPORT', color: '#64748B' }
];

export const ROI_TYPE_COLORS: Record<RoiType, { badgeBg: string; badgeText: string; label: string }> = {
  GTV: { badgeBg: 'bg-red-950/70 border-red-500/50', badgeText: 'text-red-400', label: 'GTV' },
  CTV: { badgeBg: 'bg-amber-950/70 border-amber-500/50', badgeText: 'text-amber-400', label: 'CTV' },
  PTV: { badgeBg: 'bg-rose-950/70 border-rose-500/50', badgeText: 'text-rose-400', label: 'PTV' },
  OAR: { badgeBg: 'bg-emerald-950/70 border-emerald-500/50', badgeText: 'text-emerald-400', label: 'OAR' },
  PRV: { badgeBg: 'bg-cyan-950/70 border-cyan-500/50', badgeText: 'text-cyan-400', label: 'PRV' },
  EXTERNAL: { badgeBg: 'bg-blue-950/70 border-blue-500/50', badgeText: 'text-blue-400', label: 'BODY' },
  SUPPORT: { badgeBg: 'bg-slate-800/70 border-slate-600/50', badgeText: 'text-slate-300', label: 'SOPORTE' },
  AVOIDANCE: { badgeBg: 'bg-purple-950/70 border-purple-500/50', badgeText: 'text-purple-400', label: 'EVITACIÓN' }
};
