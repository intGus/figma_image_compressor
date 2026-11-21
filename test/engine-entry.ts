// Test-only bundle entry: the real compression engine plus a JPEG decoder for checking output.
import mozjpegDecFactory from '@jsquash/jpeg/codec/dec/mozjpeg_dec.js';
import mozjpegDecWasm from 'wasm-gz:@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
import { compileWasm } from '../src/engine/wasm';

export { compressImage } from '../src/engine/compress';
export { encodePng, decodePng } from '../src/engine/codecs';

export async function decodeJpeg(bytes: Uint8Array) {
  const module = await compileWasm('mozjpeg_dec', mozjpegDecWasm);
  const dec = await mozjpegDecFactory({
    noInitialRun: true,
    instantiateWasm(imports: WebAssembly.Imports, done: (i: WebAssembly.Instance) => void) {
      WebAssembly.instantiate(module, imports).then(done);
      return {};
    },
  });
  return dec.decode(bytes, false) as { data: Uint8ClampedArray; width: number; height: number };
}
