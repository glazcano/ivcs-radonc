import {REVISION_CODE} from '../appInfo';
/** Local DICOM RTSTRUCT export. TPS compatibility must be verified with the supplied Monaco 6 protocol. */
import { DicomSeries, DicomSlice, StructureRoi, RoiType } from '../types';
import { exportLoops } from './rtGeometry';
import { validateVolume } from './geometry';

export interface MonacoExportOptions {
  holeMode?: 'keyhole'|'xor';
  structureSetLabel?: string; // Max 16 characters (e.g. 'MONACO_STRUCT')
  structureSetName?: string;  // Descriptive name (e.g. 'IVCS_RT_TPS')
  pointToleranceMm?: number;  // Simplification tolerance in mm (default: 0 mm)
  onlyVisibleRois?: boolean;   // Export only visible ROIs (default: false)
  institutionName?: string;
  minContourAreaMm2?: number;  // Filter micro-noise contours (default: 0 mm²)
}

export interface MonacoExportSummary {
  fileName: string;
  fileSizeBytes: number;
  structuresCount: number;
  totalContoursCount: number;
  referencedSlicesCount: number;
  patientName: string;
  patientId: string;
  structureSetLabel: string;
  structureNames: string[];
}

/**
 * Clean string for DICOM CodeString (CS) - max 16 chars, uppercase, alphanum and underscore only
 */
function toDicomCodeString(str: string, maxLength: number = 16): string {
  if (!str) return 'STRUCT_SET';
  const clean = str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return (clean || 'STRUCT_SET').substring(0, maxLength);
}

/**
 * Clean string for DICOM LongString (LO) / ShortString (SH) - max 64 chars
 */
function toDicomString(str: string, maxLength: number = 64): string {
  if (!str) return 'ROI';
  const clean = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\-_.]/g, '')
    .trim();
  return (clean || 'ROI').substring(0, maxLength);
}

/**
 * Maps application ROI types to Elekta Monaco recognized DICOM RT ROI Interpreted Types
 */
function mapToMonacoInterpretedType(roi: StructureRoi): string {
  const upperName = roi.name.toUpperCase().trim();

  // If named BODY or EXTERNAL, Monaco strictly requires 'EXTERNAL' for body outline & dose grid
  if (upperName === 'BODY' || upperName === 'EXTERNAL' || upperName.startsWith('BODY_') || upperName.startsWith('EXTERNAL_') || roi.type === 'EXTERNAL') {
    return 'EXTERNAL';
  }

  switch (roi.type) {
    case 'PTV':
      return 'PTV';
    case 'CTV':
      return 'CTV';
    case 'GTV':
      return 'GTV';
    case 'OAR':
    case 'PRV':
      return 'ORGAN';
    case 'AVOIDANCE':
      return 'AVOIDANCE';
    case 'SUPPORT':
      return 'SUPPORT';
    default:
      if (upperName.includes('PTV')) return 'PTV';
      if (upperName.includes('CTV')) return 'CTV';
      if (upperName.includes('GTV')) return 'GTV';
      if (upperName.includes('TABLE') || upperName.includes('COUCH')) return 'SUPPORT';
      return 'ORGAN';
  }
}

/**
 * Converts Hex color ('#RRGGBB') to DICOM Integer String 'R\\G\\B' (0-255)
 */
function hexToDicomColor(hex: string): string {
  if (!hex || !hex.startsWith('#') || hex.length < 7) {
    return '0\\229\\255'; // Medical cyan default
  }
  const r = parseInt(hex.substring(1, 3), 16) || 0;
  const g = parseInt(hex.substring(3, 5), 16) || 0;
  const b = parseInt(hex.substring(5, 7), 16) || 0;
  return `${r}\\${g}\\${b}`;
}

/**
 * Format date to DICOM DA (YYYYMMDD)
 */
function getDicomDate(d: Date = new Date()): string {
  const year = d.getFullYear().toString().padStart(4, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format time to DICOM TM (HHMMSS)
 */
function getDicomTime(d: Date = new Date()): string {
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  return `${hours}${minutes}${seconds}`;
}

/**
 * Point in 2D pixel coordinates [col, row]
 */
type Point2D = [number, number];

/**
 * Point in 3D Patient Reference Coordinate System [X, Y, Z] (mm)
 */
type Point3D = [number, number, number];

/**
 * Douglas-Peucker 2D Polygon Simplification
 */
function simplifyPolygon(points: Point2D[], tolerance: number): Point2D[] {
  if (points.length <= 4) return points;

  let maxDist = 0;
  let maxIndex = 0;
  const end = points.length - 1;

  const [x1, y1] = points[0];
  const [x2, y2] = points[end];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lineLengthSq = dx * dx + dy * dy;

  for (let i = 1; i < end; i++) {
    const [px, py] = points[i];
    let dist: number;
    if (lineLengthSq === 0) {
      const dpx = px - x1;
      const dpy = py - y1;
      dist = Math.sqrt(dpx * dpx + dpy * dpy);
    } else {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lineLengthSq));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const dpx = px - projX;
      const dpy = py - projY;
      dist = Math.sqrt(dpx * dpx + dpy * dpy);
    }

    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPolygon(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIndex), tolerance);
    return left.slice(0, left.length - 1).concat(right);
  }

  return [points[0], points[end]];
}

/**
 * Extracts 2D polygon boundaries from a binary mask (Uint8Array)
 * using Moore-Neighbor 8-connected boundary tracing with loop closure.
 */
function traceMaskPolygons(
  mask: Uint8Array,
  rows: number,
  cols: number,
  pixelTolerance: number = 0.6
): Point2D[][] {
  const polygons: Point2D[][] = [];
  const visited = new Uint8Array(rows * cols);

  // 8-neighborhood directional offsets (clockwise starting from North)
  // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
  const dc = [0, 1, 1, 1, 0, -1, -1, -1];
  const dr = [-1, -1, 0, 1, 1, 1, 0, -1];

  for (let r = 0; r < rows; r++) {
    const rOffset = r * cols;
    for (let c = 0; c < cols; c++) {
      const idx = rOffset + c;
      if (mask[idx] !== 1) continue;

      // Check if this is an unvisited outer boundary pixel (has an empty neighbor or touches image edge)
      const isBoundary =
        r === 0 || r === rows - 1 || c === 0 || c === cols - 1 ||
        mask[idx - cols] === 0 || mask[idx + cols] === 0 ||
        mask[idx - 1] === 0 || mask[idx + 1] === 0;

      if (!isBoundary) continue;
      if (visited[idx] === 1) continue;

      // Start contour tracing
      const boundaryPoints: Point2D[] = [];
      let currR = r;
      let currC = c;
      let startR = r;
      let startC = c;

      // Direction of the backtrack (started from empty space above/left)
      let enterDir = 0;
      if (r > 0 && mask[(r - 1) * cols + c] === 0) enterDir = 0; // came from North
      else if (c > 0 && mask[r * cols + (c - 1)] === 0) enterDir = 6; // came from West

      boundaryPoints.push([c, r]);
      visited[idx] = 1;

      let maxSteps = rows * cols * 2;
      let step = 0;
      let closed = false;

      while (step < maxSteps) {
        step++;
        // Scan around curr in clockwise direction starting from (enterDir + 5) % 8
        let foundNext = false;
        let nextDir = (enterDir + 5) % 8;

        for (let i = 0; i < 8; i++) {
          const dir = (nextDir + i) % 8;
          const nr = currR + dr[dir];
          const nc = currC + dc[dir];

          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const nIdx = nr * cols + nc;
            if (mask[nIdx] === 1) {
              // Found next boundary pixel
              currR = nr;
              currC = nc;
              enterDir = dir;
              foundNext = true;
              break;
            }
          }
        }

        if (!foundNext) {
          // Isolated single pixel
          break;
        }

        if (currR === startR && currC === startC) {
          closed = true;
          break;
        }

        boundaryPoints.push([currC, currR]);
        visited[currR * cols + currC] = 1;
      }

      if (closed && boundaryPoints.length >= 3) {
        // Close polygon loop
        boundaryPoints.push([startC, startR]);

        // Simplify redundant collinear points using Douglas-Peucker
        const simplified = simplifyPolygon(boundaryPoints, pixelTolerance);
        if (simplified.length >= 4) {
          polygons.push(simplified);
        }
      }
    }
  }

  return polygons;
}

/**
 * Calculates 2D polygon area in mm² using the Shoelace formula
 */
function calculatePolygonAreaMm2(poly: Point3D[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[i + 1];
    sum += (x1 * y2 - x2 * y1);
  }
  return Math.abs(sum) / 2;
}

/**
 * Transforms 2D slice pixel coordinates (c, r) into 3D Patient Reference Coordinates (X, Y, Z) in mm.
 */
function pixelToPatientCoordinate(
  col: number,
  row: number,
  slice: DicomSlice
): Point3D {
  const [rowSpacing, colSpacing] = slice.pixelSpacing || [1.0, 1.0];
  const ipp = slice.imagePositionPatient || [-250, -250, slice.sliceLocation];
  const iop = slice.imageOrientationPatient || [1, 0, 0, 0, 1, 0];

  const [sx, sy, sz] = ipp;
  const [xx, xy, xz, yx, yy, yz] = iop;

  // Formula: P_xyz = IPP + col * colSpacing * IOP_row + row * rowSpacing * IOP_col
  const x = sx + col * colSpacing * xx + row * rowSpacing * yx;
  const y = sy + col * colSpacing * xy + row * rowSpacing * yy;
  const z = sz + col * colSpacing * xz + row * rowSpacing * yz;

  return [x, y, z];
}

/**
 * Dynamic Little Endian Binary Writer for DICOM Part 10 files
 */
export class DicomBinaryBuffer {
  private buffer: Uint8Array;
  private view: DataView;
  private offset: number = 0;

  constructor(initialCapacity: number = 2 * 1024 * 1024) {
    this.buffer = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buffer.buffer);
  }

  private ensureCapacity(neededBytes: number) {
    if (this.offset + neededBytes > this.buffer.length) {
      let newCapacity = Math.max(this.buffer.length * 2, this.offset + neededBytes + 1024 * 1024);
      const newBuffer = new Uint8Array(newCapacity);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  public getLength(): number {
    return this.offset;
  }

  public getBytes(): Uint8Array {
    return this.buffer.slice(0, this.offset);
  }

  public writeUint8(val: number) {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, val);
    this.offset += 1;
  }

  public writeUint16(val: number) {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, val, true);
    this.offset += 2;
  }

  public writeUint32(val: number) {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, val, true);
    this.offset += 4;
  }

  public writeBytes(bytes: Uint8Array | number[]) {
    this.ensureCapacity(bytes.length);
    if (bytes instanceof Uint8Array) {
      this.buffer.set(bytes, this.offset);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer[this.offset + i] = bytes[i];
      }
    }
    this.offset += bytes.length;
  }

  public writeAsciiString(str: string) {
    this.ensureCapacity(str.length);
    for (let i = 0; i < str.length; i++) {
      this.buffer[this.offset + i] = str.charCodeAt(i) & 0xFF;
    }
    this.offset += str.length;
  }

  /**
   * Writes a standard Explicit VR element
   */
  public writeElement(
    group: number,
    element: number,
    vr: string,
    valueBytes: Uint8Array,
    padByte: number = 0x20
  ) {
    // Write Tag (Group, Element)
    this.writeUint16(group);
    this.writeUint16(element);

    // Pad value to even byte length if necessary
    let len = valueBytes.length;
    let needsPad = len % 2 !== 0;
    let effectiveLen = needsPad ? len + 1 : len;

    // Standard 2-character VR
    this.writeAsciiString(vr);

    // Long VRs: OB, OW, OF, SQ, UT, UN, UC, UR use 2 reserved bytes + 4-byte uint32 length
    const isLongVR = vr === 'OB' || vr === 'OW' || vr === 'OF' || vr === 'SQ' || vr === 'UT' || vr === 'UN' || vr === 'UC' || vr === 'UR';

    if (isLongVR) {
      this.writeUint16(0); // 2 reserved bytes
      this.writeUint32(effectiveLen);
    } else {
      this.writeUint16(effectiveLen);
    }

    // Value bytes
    this.writeBytes(valueBytes);
    if (needsPad) {
      this.writeUint8(padByte);
    }
  }

  /**
   * Writes string element with padding (UI uses 0x00, others use 0x20 space)
   */
  public writeStringElement(group: number, element: number, vr: string, text: string) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const padByte = vr === 'UI' ? 0x00 : 0x20;
    this.writeElement(group, element, vr, bytes, padByte);
  }

  /**
   * Writes sequence element with explicit item contents
   */
  public writeSequence(group: number, element: number, items: Array<Uint8Array>) {
    // Write Tag
    this.writeUint16(group);
    this.writeUint16(element);
    this.writeAsciiString('SQ');
    this.writeUint16(0); // 2 reserved bytes

    // Calculate total sequence length (each item is 4 bytes tag + 4 bytes length + item bytes)
    let totalLen = 0;
    for (const item of items) {
      totalLen += 8 + item.length;
    }

    this.writeUint32(totalLen);

    // Write items
    for (const item of items) {
      this.writeUint16(0xFFFE); // Item Tag (FFFE, E000)
      this.writeUint16(0xE000);
      this.writeUint32(item.length);
      this.writeBytes(item);
    }
  }
}

/**
 * Main Export Function for Elekta Monaco RTSTRUCT
 */
export function exportMonacoRtStruct(
  series: DicomSeries,
  rois: StructureRoi[],
  options: MonacoExportOptions = {}
): { blob: Blob; fileName: string; summary: MonacoExportSummary } {
  if (!series || series.slices.length === 0) {
    throw new Error('No hay cortes DICOM disponibles para exportar.');
  }
  validateVolume(series.slices);
  if (!series.studyInstanceUID || !series.seriesInstanceUID || !series.frameOfReferenceUID || series.slices.some(s => !s.sopInstanceUID || !s.sopClassUID)) {
    throw new Error('La exportación RTSTRUCT requiere identificadores DICOM originales. Cargue una serie DICOM; la demostración no se exporta como estudio real.');
  }

  const structureSetLabel = toDicomCodeString(options.structureSetLabel || 'MONACO_STRUCT', 16);
  const structureSetName = toDicomString(options.structureSetName || 'IVCS_RT_TPS', 64);
  const pointToleranceMm = options.pointToleranceMm ?? 0;
  const minContourAreaMm2 = options.minContourAreaMm2 ?? 0;
  if(!Number.isFinite(pointToleranceMm) || pointToleranceMm<0 || !Number.isFinite(minContourAreaMm2) || minContourAreaMm2<0)throw new Error("Parámetros de exportación inválidos.");

  // Filter ROIs with contours
  const validRois = rois.filter(roi => {
    if (options.onlyVisibleRois && !roi.visible) return false;
    const slicesWithMask = Object.keys(roi.sliceMasks);
    return slicesWithMask.some(sIdx => {
      const mask = roi.sliceMasks[Number(sIdx)];
      return mask && mask.some(v => v === 1);
    });
  });

  if (validRois.length === 0) {
    throw new Error('No hay ninguna estructura con contornos dibujados para exportar a TPS.');
  }
  const exportedNames=validRois.map(r=>toDicomString(r.name,64).toLowerCase());
  if(new Set(exportedNames).size!==exportedNames.length)throw new Error('Dos nombres coinciden al normalizarlos para DICOM. Renombre las estructuras.');

  // Common DICOM UIDs and Metadata
  const now = new Date();
  const creationDate = getDicomDate(now);
  const creationTime = getDicomTime(now);

  const uid=()=>`2.25.${BigInt('0x'+crypto.randomUUID().replace(/-/g,''))}`;
  const rtStructSopInstanceUID = uid();
  const rtStructSeriesUID = uid();
  const studyInstanceUID = series.studyInstanceUID || `1.2.826.0.1.3680043.9.7126.1.${Date.now()}`;
  const ctSeriesInstanceUID = series.seriesInstanceUID || `1.2.826.0.1.3680043.9.7126.2.${Date.now()}`;
  const frameOfReferenceUID = series.frameOfReferenceUID || `1.2.826.0.1.3680043.9.7126.3.${Date.now()}`;
  const ctSopClassUID = '1.2.840.10008.5.1.4.1.1.2'; // CT Image Storage SOP Class

  // Map each slice to its SOP Instance UID
  const sliceIndexToSlice = new Map<number, DicomSlice>();
  series.slices.forEach(s => sliceIndexToSlice.set(s.sliceIndex, s));

  // Build Referenced Study & Series Sequence for CT images
  const contourImageItems: Uint8Array[] = [];
  for (const slice of series.slices) {
    const itemBuf = new DicomBinaryBuffer(256);
    itemBuf.writeStringElement(0x0008, 0x1150, 'UI', slice.sopClassUID!);
    itemBuf.writeStringElement(0x0008, 0x1155, 'UI', slice.sopInstanceUID || `1.2.826.0.1.3680043.9.7126.4.${Date.now()}.${slice.sliceIndex}`);
    contourImageItems.push(itemBuf.getBytes());
  }

  const rtReferencedSeriesItemBuf = new DicomBinaryBuffer(contourImageItems.length * 100 + 100);
  rtReferencedSeriesItemBuf.writeStringElement(0x0020, 0x000E, 'UI', ctSeriesInstanceUID);
  rtReferencedSeriesItemBuf.writeSequence(0x3006, 0x0016, contourImageItems);

  const rtReferencedStudyItemBuf = new DicomBinaryBuffer(rtReferencedSeriesItemBuf.getLength() + 200);
  rtReferencedStudyItemBuf.writeStringElement(0x0008, 0x1150, 'UI', '1.2.840.10008.3.1.2.3.1'); // Detached Study Management SOP Class
  rtReferencedStudyItemBuf.writeStringElement(0x0008, 0x1155, 'UI', studyInstanceUID);
  rtReferencedStudyItemBuf.writeSequence(0x3006, 0x0014, [rtReferencedSeriesItemBuf.getBytes()]);

  const refFrameOfRefItemBuf = new DicomBinaryBuffer(rtReferencedStudyItemBuf.getLength() + 200);
  refFrameOfRefItemBuf.writeStringElement(0x0020, 0x0052, 'UI', frameOfReferenceUID);
  refFrameOfRefItemBuf.writeSequence(0x3006, 0x0012, [rtReferencedStudyItemBuf.getBytes()]);

  // Build Structure Set ROI Sequence, ROI Contour Sequence, and RT ROI Observations Sequence
  const structureSetRoiItems: Uint8Array[] = [];
  const roiContourItems: Uint8Array[] = [];
  const rtRoiObservationsItems: Uint8Array[] = [];

  let totalContoursCount = 0;
  const structureNames: string[] = [];

  validRois.forEach((roi, idx) => {
    const roiNumber = idx + 1;
    const roiName = toDicomString(roi.name || `ROI_${roiNumber}`, 64);
    structureNames.push(roiName);
    const monacoInterpretedType = mapToMonacoInterpretedType(roi);
    const isAuto = roi.type === 'EXTERNAL' || roi.name.toUpperCase().includes('BODY') || roi.name.toUpperCase().includes('AUTO');

    // 1. Structure Set ROI Item (3006,0020)
    const ssRoiBuf = new DicomBinaryBuffer(256);
    ssRoiBuf.writeStringElement(0x3006, 0x0022, 'IS', roiNumber.toString());
    ssRoiBuf.writeStringElement(0x3006, 0x0024, 'UI', frameOfReferenceUID);
    ssRoiBuf.writeStringElement(0x3006, 0x0026, 'LO', roiName);
    ssRoiBuf.writeStringElement(0x3006, 0x0028, 'ST', `${roi.type} structure for TPS`);
    ssRoiBuf.writeStringElement(0x3006, 0x0036, 'CS', isAuto ? 'AUTOMATIC' : 'MANUAL');
    structureSetRoiItems.push(ssRoiBuf.getBytes());

    // 2. ROI Contour Item (3006,0039) -> contains Contour Sequence (3006,0040)
    const contourItems: Uint8Array[] = [];
    let contourNumber = 1;

    // Iterate through all slices sorted by location
    const sortedSliceIndices = Object.keys(roi.sliceMasks)
      .map(Number)
      .sort((a, b) => {
        const locA = sliceIndexToSlice.get(a)?.sliceLocation || a;
        const locB = sliceIndexToSlice.get(b)?.sliceLocation || b;
        return locA - locB;
      });

    for (const sliceIdx of sortedSliceIndices) {
      const mask = roi.sliceMasks[sliceIdx];
      const slice = sliceIndexToSlice.get(sliceIdx);
      if (!mask || !slice) continue;

      // Extract 2D polygon boundaries
      const {loops:polygons2d}=exportLoops(mask,slice,pointToleranceMm,minContourAreaMm2,options.holeMode);

      for (const poly2d of polygons2d) {
        // Convert to 3D Patient Coordinates
        const poly3d: Point3D[] = poly2d.map(([c, r]) => pixelToPatientCoordinate(c, r, slice));

        // Filter micro-noise contours
        const areaMm2 = calculatePolygonAreaMm2(poly3d);


        const numPoints = poly3d.length;
        if (numPoints < 3) continue;

        // Build Contour Data (DS) string: X1\Y1\Z1\X2\Y2\Z2\...
        // Six decimal places with the DICOM DS length limit.
        const coordStrings: string[] = [];
        for (let p = 0; p < numPoints; p++) {
          const pt = poly3d[p];
          for(const value of pt){const decimal=Number(value.toFixed(6)).toString();coordStrings.push(decimal.length<=16?decimal:value.toExponential(8));}
        }
        const contourDataStr = coordStrings.join('\\');
        if(contourDataStr.length>65534)throw new Error('Contorno demasiado complejo para DS explícito. Reduzca la complejidad antes de exportar.');

        // Contour Image Sequence linking to exact CT slice
        const contourImageItemBuf = new DicomBinaryBuffer(128);
        contourImageItemBuf.writeStringElement(0x0008, 0x1150, 'UI', slice.sopClassUID!);
        contourImageItemBuf.writeStringElement(0x0008, 0x1155, 'UI', slice.sopInstanceUID || `1.2.826.0.1.3680043.9.7126.4.${Date.now()}.${slice.sliceIndex}`);

        // Contour Item (3006,0040)
        const contourItemBuf = new DicomBinaryBuffer(contourDataStr.length + 256);
        contourItemBuf.writeStringElement(0x3006, 0x0048, 'IS', contourNumber.toString());
        contourItemBuf.writeSequence(0x3006, 0x0016, [contourImageItemBuf.getBytes()]);
        contourItemBuf.writeStringElement(0x3006, 0x0042, 'CS', options.holeMode==='xor'?'CLOSEDPLANAR_XOR':'CLOSED_PLANAR');
        contourItemBuf.writeStringElement(0x3006, 0x0046, 'IS', numPoints.toString());
        contourItemBuf.writeStringElement(0x3006, 0x0050, 'DS', contourDataStr);

        contourItems.push(contourItemBuf.getBytes());
        contourNumber++;
        totalContoursCount++;
      }
    }

    const roiContourBuf = new DicomBinaryBuffer(contourItems.length * 512 + 256);
    roiContourBuf.writeStringElement(0x3006, 0x002A, 'IS', hexToDicomColor(roi.color));
    roiContourBuf.writeStringElement(0x3006, 0x0084, 'IS', roiNumber.toString());
    if (contourItems.length > 0) {
      roiContourBuf.writeSequence(0x3006, 0x0040, contourItems);
    }
    roiContourItems.push(roiContourBuf.getBytes());

    // 3. RT ROI Observations Item (3006,0080)
    const rtObsBuf = new DicomBinaryBuffer(256);
    rtObsBuf.writeStringElement(0x3006, 0x0082, 'IS', roiNumber.toString());
    rtObsBuf.writeStringElement(0x3006, 0x0084, 'IS', roiNumber.toString());
    rtObsBuf.writeStringElement(0x3006, 0x00A4, 'CS', monacoInterpretedType); // Crucial for Monaco!
    rtObsBuf.writeStringElement(0x3006, 0x00A6, 'PN', '');
    rtRoiObservationsItems.push(rtObsBuf.getBytes());
  });

  // Assemble Main Dataset (Group 0008 to 300E)
  const datasetBuf = new DicomBinaryBuffer(4 * 1024 * 1024);

  // Group 0008 (Identifying)
  datasetBuf.writeStringElement(0x0008, 0x0005, 'CS', 'ISO_IR 192');
  datasetBuf.writeStringElement(0x0008, 0x0012, 'DA', creationDate);
  datasetBuf.writeStringElement(0x0008, 0x0013, 'TM', creationTime);
  datasetBuf.writeStringElement(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.481.3'); // RT Structure Set Storage
  datasetBuf.writeStringElement(0x0008, 0x0018, 'UI', rtStructSopInstanceUID);
  datasetBuf.writeStringElement(0x0008, 0x0020, 'DA', series.studyDate || creationDate);
  datasetBuf.writeStringElement(0x0008, 0x0030, 'TM', series.studyTime || creationTime);
  datasetBuf.writeStringElement(0x0008, 0x0050, 'SH', series.accessionNumber || 'MONACO_ACC');
  datasetBuf.writeStringElement(0x0008, 0x0060, 'CS', 'RTSTRUCT');
  datasetBuf.writeStringElement(0x0008, 0x0070, 'LO', 'IVCS RT');
  datasetBuf.writeStringElement(0x0008, 0x0090, 'PN', '');
  datasetBuf.writeStringElement(0x0008, 0x1030, 'LO', toDicomString(series.studyDescription || 'Planificación Radioterapia'));
  datasetBuf.writeStringElement(0x0008, 0x103E, 'LO', 'TPS RTSTRUCT Contornos');
  datasetBuf.writeStringElement(0x0008, 0x1090, 'LO', 'IVCS RT');

  // Group 0010 (Patient)
  datasetBuf.writeStringElement(0x0010, 0x0010, 'PN', series.patientName);
  datasetBuf.writeStringElement(0x0010, 0x0020, 'LO', series.patientId);
  datasetBuf.writeStringElement(0x0010, 0x0030, 'DA', series.patientBirthDate || '');
  datasetBuf.writeStringElement(0x0010, 0x0040, 'CS', series.patientSex || 'O');

  // Group 0018 (Acquisition)
  datasetBuf.writeStringElement(0x0018, 0x1020, 'LO', '1.0');

  // Group 0020 (Relationship)
  datasetBuf.writeStringElement(0x0020, 0x000D, 'UI', studyInstanceUID);
  datasetBuf.writeStringElement(0x0020, 0x000E, 'UI', rtStructSeriesUID);
  datasetBuf.writeStringElement(0x0020, 0x0010, 'SH', '1');
  datasetBuf.writeStringElement(0x0020, 0x0011, 'IS', '1');
  datasetBuf.writeStringElement(0x0020, 0x0013, 'IS', '1');

  // Group 3006 (Structure Set Module)
  datasetBuf.writeStringElement(0x3006, 0x0002, 'CS', structureSetLabel);
  datasetBuf.writeStringElement(0x3006, 0x0004, 'LO', structureSetName);
  datasetBuf.writeStringElement(0x3006, 0x0006, 'ST', 'RTSTRUCT exportado para TPS con coordenadas RCS y tipo CLOSED_PLANAR');
  datasetBuf.writeStringElement(0x3006, 0x0008, 'DA', creationDate);
  datasetBuf.writeStringElement(0x3006, 0x0009, 'TM', creationTime);

  // Referenced Frame of Reference Sequence (3006,0010)
  datasetBuf.writeSequence(0x3006, 0x0010, [refFrameOfRefItemBuf.getBytes()]);

  // Structure Set ROI Sequence (3006,0020)
  datasetBuf.writeSequence(0x3006, 0x0020, structureSetRoiItems);

  // ROI Contour Sequence (3006,0039)
  datasetBuf.writeSequence(0x3006, 0x0039, roiContourItems);

  // RT ROI Observations Sequence (3006,0080)
  datasetBuf.writeSequence(0x3006, 0x0080, rtRoiObservationsItems);

  // Group 300E (Approval)
  datasetBuf.writeStringElement(0x300E, 0x0002, 'CS', 'UNAPPROVED');

  const datasetBytes = datasetBuf.getBytes();

  // Assemble Group 0002 (File Meta Information)
  const metaElementsBuf = new DicomBinaryBuffer(1024);
  metaElementsBuf.writeElement(0x0002, 0x0001, 'OB', new Uint8Array([0x00, 0x01])); // File Meta Information Version
  metaElementsBuf.writeStringElement(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.481.3'); // Media Storage SOP Class UID
  metaElementsBuf.writeStringElement(0x0002, 0x0003, 'UI', rtStructSopInstanceUID); // Media Storage SOP Instance UID
  metaElementsBuf.writeStringElement(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1'); // Explicit VR Little Endian
  metaElementsBuf.writeStringElement(0x0002, 0x0012, 'UI', '1.2.826.0.1.3680043.9.7126.1'); // Implementation Class UID
  metaElementsBuf.writeStringElement(0x0002, 0x0013, 'SH', `IVCSRT_${REVISION_CODE}`);

  const metaBytes = metaElementsBuf.getBytes();

  // Complete DICOM Part 10 File Buffer
  // 128 bytes preamble + 4 bytes 'DICM' + (0002,0000) element (12 bytes) + metaBytes + datasetBytes
  const totalFileSize = 128 + 4 + 12 + metaBytes.length + datasetBytes.length;
  const fileBuf = new DicomBinaryBuffer(totalFileSize);

  // 1. 128 bytes preamble (zeros)
  for (let i = 0; i < 128; i++) fileBuf.writeUint8(0x00);

  // 2. 4 bytes DICM magic prefix
  fileBuf.writeUint8(0x44); // 'D'
  fileBuf.writeUint8(0x49); // 'I'
  fileBuf.writeUint8(0x43); // 'C'
  fileBuf.writeUint8(0x4D); // 'M'

  // 3. (0002,0000) File Meta Information Group Length (UL)
  fileBuf.writeUint16(0x0002);
  fileBuf.writeUint16(0x0000);
  fileBuf.writeAsciiString('UL');
  fileBuf.writeUint16(4);
  fileBuf.writeUint32(metaBytes.length);

  // 4. File Meta Information elements
  fileBuf.writeBytes(metaBytes);

  // 5. Main Dataset elements
  fileBuf.writeBytes(datasetBytes);

  const finalBytes = fileBuf.getBytes();
  const cleanId = toDicomCodeString(series.patientId, 12);
  const fileName = `RS.TPS_${cleanId}_${creationDate}.dcm`;

  const blob = new Blob([finalBytes], { type: 'application/dicom' });

  const summary: MonacoExportSummary = {
    fileName,
    fileSizeBytes: finalBytes.length,
    structuresCount: validRois.length,
    totalContoursCount,
    referencedSlicesCount: series.slices.length,
    patientName: series.patientName,
    patientId: series.patientId,
    structureSetLabel,
    structureNames
  };

  return { blob, fileName, summary };
}
