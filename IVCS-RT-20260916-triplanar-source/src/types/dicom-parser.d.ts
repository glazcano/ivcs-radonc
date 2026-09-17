declare module 'dicom-parser' {
  export interface DataSet {
    ivcsRaw?: boolean;
    string(tag: string): string | undefined;
    uint16(tag: string): number | undefined;
    int16(tag: string): number | undefined;
    intString(tag: string): number | undefined;
    float(tag: string): number | undefined;
    elements: Record<string, {
      tag: string;
      vr: string;
      length: number;
      dataOffset: number;
      encapsulatedPixelData?: boolean;
    }>;
    byteArray: Uint8Array;
  }

  export function parseDicom(byteArray: Uint8Array, options?: Record<string, unknown>): DataSet;
  const parser: { parseDicom: typeof parseDicom };
  export default parser;
}
