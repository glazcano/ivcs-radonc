export type RoiType = 'GTV' | 'CTV' | 'PTV' | 'OAR' | 'EXTERNAL' | 'PRV' | 'SUPPORT' | 'AVOIDANCE';

export interface StructureRoi {
  favorite?: boolean;
  id: string;
  name: string;
  type: RoiType;
  color: string; // Hex color e.g. '#FF0000'
  visible: boolean;
  locked: boolean;
  opacity: number; // 0.0 to 1.0 (0.0 = Solo líneas de contorno / sin relleno)
  // Each slice index maps to a Uint8Array binary mask of size (rows * cols)
  sliceMasks: { [sliceIndex: number]: Uint8Array };
  // Approximate volume in cm3 (cached)
  volumeCm3?: number;
}

export type PixelValues = Int16Array | Float32Array;
export interface DicomSlice {
  inverted?: boolean;
  pixelType?: "i16" | "f32";
  units?: string;
  frameNumber?: number;
  valid?: Uint8Array;
  sourceRaw?: boolean;
  sourceTransferSyntax?: string;
  sourceCompressed?: boolean;
  sourceLossy?: boolean;
  id: string;
  sliceIndex: number;
  rows: number;
  cols: number;
  pixelSpacing: [number, number]; // [rowSpacing_mm, colSpacing_mm]
  sliceThickness: number; // mm
  sliceLocation: number; // z position in mm
  windowCenter: number; // HU
  windowWidth: number; // HU
  rescaleIntercept: number;
  rescaleSlope: number;
  huData: PixelValues; // Calculated HU values (length: rows * cols)
  minHU: number;
  maxHU: number;
  fileName?: string;
  sopInstanceUID?: string;
  sopClassUID?: string;
  imagePositionPatient?: [number, number, number]; // [Sx, Sy, Sz]
  imageOrientationPatient?: [number, number, number, number, number, number]; // [Xx, Xy, Xz, Yx, Yy, Yz]
}

export interface DicomSeries {
  acquisitionDimensions?: Record<string,string>;
  sourceVolume?: DicomSeries;
  resampling?: {method:string; spacingMm:number; sourceSeriesUID:string; irregular?:boolean; gaps?:number};
  acquisitionKey?: string;
  patientName: string;
  patientId: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string; // 'CT', 'MR', etc.
  slices: DicomSlice[];
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  frameOfReferenceUID?: string;
  patientBirthDate?: string;
  patientSex?: string;
  studyDate?: string;
  studyTime?: string;
  accessionNumber?: string;
}

export type ToolType = 
  | 'brush' 
  | 'pencil' 
  | 'polygon' 
  | 'eraser' 
  | 'threshold' 
  | 'window' 
  | 'pan' 
  | 'zoom' 
  | 'ruler';

export type ContourDrawMode = 'closed' | 'open';

export type MprPlane = 'axial' | 'coronal' | 'sagittal';

export type MprViewMode = 'axial' | 'coronal' | 'sagittal' | 'triplanar' | 'oneplus2';

export interface MprCoordinates {
  x: number; // Sagittal slice / col index [0, cols-1]
  y: number; // Coronal slice / row index [0, rows-1]
  z: number; // Axial slice index [0, slices.length-1]
}

export type BooleanOpType = 'union' | 'intersection' | 'difference' | 'xor';

export interface AsymmetricMargin {
  superior: number;  // Arriba / Cranial (+Z) in mm (pos=expand, neg=erode)
  inferior: number;  // Abajo / Caudal (-Z) in mm (pos=expand, neg=erode)
  anterior: number;  // Adelante / Ant (-Y) in mm (pos=expand, neg=erode)
  posterior: number; // Atrás / Post (+Y) in mm (pos=expand, neg=erode)
  left: number;      // Izquierda / L (+X) in mm (pos=expand, neg=erode)
  right: number;     // Derecha / R (-X) in mm (pos=expand, neg=erode)
}

export interface WindowPreset {
  name: string;
  center: number;
  width: number;
  description: string;
}

export interface MarginConfig {
  sourceRoiId: string;
  targetRoiOption: 'new' | 'overwrite';
  targetRoiName: string;
  targetRoiColor: string;
  targetRoiType: RoiType;
  margin: AsymmetricMargin;
  isAsymmetric?: boolean;
  marginMm?: number; // legacy uniform compatibility
  scope: 'slice' | 'series'; // Current slice or entire 3D volume
}

export interface BooleanOpConfig {
  sourceRoiAId: string;
  applyMarginA?: boolean;
  marginA?: AsymmetricMargin;
  operation: BooleanOpType;
  sourceRoiBId: string;
  applyMarginB?: boolean;
  marginB?: AsymmetricMargin;
  targetRoiOption: 'new' | 'overwrite_a';
  targetRoiName: string;
  targetRoiColor: string;
  targetRoiType: RoiType;
  scope: 'slice' | 'series';
}

export interface InterpolationConfig {
  sourceRoiId: string;
  mode: 'gaps' | 'range';
  startSlice?: number;
  endSlice?: number;
}

export interface ContourHistoryEntry {
  description: string;
  timestamp: number;
  roisSnapshot: StructureRoi[];
}

export type ModalityType = 'CT' | 'MR' | 'PT' | 'PET' | 'PETCT';

export interface ImageStudy {
  acquisitionDimensions?: Record<string,string>;
  sourceVolume?: DicomSeries;
  resampling?: DicomSeries["resampling"];
  acquisitionKey?: string;
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  frameOfReferenceUID?: string;
  patientBirthDate?: string;
  patientSex?: string;
  studyDate?: string;
  studyTime?: string;
  accessionNumber?: string;
  id: string;
  patientName: string;
  patientId: string;
  studyDescription: string;
  seriesDescription: string;
  modality: ModalityType | string;
  slices: DicomSlice[];
  colorMap?: 'grayscale' | 'hot_iron' | 'rainbow' | 'cyan' | 'green';
  defaultWindowCenter?: number;
  defaultWindowWidth?: number;
  date?: string;
}

export interface RegistrationTransform {
  model?: 'rigid3d';
  center?: [number,number,number];
  rotationX?: number;
  rotationY?: number;
  translationX: number; // mm in lateral axis
  translationY: number; // mm in vertical axis
  translationZ: number; // slice offset / mm in cranial-caudal axis
  rotationDeg: number;  // degrees
  scaleX: number;
  scaleY: number;
  locked: boolean;
}

export interface RegistrationVoi {
  enabled: boolean;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minSlice: number;
  maxSlice: number;
}

export type FusionMode = 'blend' | 'checkerboard' | 'split_horizontal' | 'split_vertical' | 'difference';

export type RegistrationAlgorithm = 'mutual_information' | 'cross_correlation' | 'center_of_mass';

export type ColorMapType = 'hot_iron' | 'rainbow' | 'cyan' | 'grayscale';

export type RigidTransform3D = RegistrationTransform;

export interface RegistrationState {
  detachedSeriesIds?: string[];
  relationPolicies?: Record<string,'preserve'|'dicom'|'saved'|'single'>;
  active: boolean;
  referenceStudyId: string;
  secondaryStudyId: string;
  fusionMode: FusionMode;
  fusionOpacity: number; // 0.0 to 1.0
  checkerboardSize: number; // px (e.g. 32, 64)
  splitPosition: number; // 0.0 to 1.0
  transforms: Record<string, RegistrationTransform>;
  voi: RegistrationVoi;
  showVoiOverlay: boolean;
  secondaryWindowCenter: number;
  secondaryWindowWidth: number;
  secondaryColorMap: 'hot_iron' | 'rainbow' | 'cyan' | 'grayscale';
}
