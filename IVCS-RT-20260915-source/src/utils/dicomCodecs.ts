import codecs from 'dcmjs-codecs';
const {NativeCodecs,Transcoder}=codecs;
let ready:Promise<void>|undefined;
export async function decompress(bytes:Uint8Array):Promise<Uint8Array>{
  ready ||= NativeCodecs.initializeAsync(typeof window==='undefined' && typeof self==='undefined' ? {} : {
    webAssemblyModulePathOrUrl:new URL('../../node_modules/dcmjs-codecs/build/dcmjs-native-codecs.wasm',import.meta.url).href
  });
  await ready;
  const input=bytes.slice().buffer;
  const transcoder=new Transcoder(input);
  transcoder.transcode('1.2.840.10008.1.2.1');
  return new Uint8Array(transcoder.getDicomPart10());
}
