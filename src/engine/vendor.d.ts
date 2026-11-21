// Types for the bundled codec internals we import directly (instead of the jSquash
// package entry points, which would try to fetch .wasm files or pull in the
// multi-threaded builds we can't use inside Figma).

declare module 'wasm-gz:*' {
  /** gzip-compressed .wasm bytes, base64 encoded (see scripts/build.mjs). */
  const gzBase64: string;
  export default gzBase64;
}

type EmscriptenFactory = (opts: Record<string, unknown>) => Promise<any>;

declare module '@jsquash/jpeg/codec/enc/mozjpeg_enc.js' {
  const factory: EmscriptenFactory;
  export default factory;
}
declare module '@jsquash/jpeg/codec/dec/mozjpeg_dec.js' {
  const factory: EmscriptenFactory;
  export default factory;
}
declare module '@jsquash/webp/codec/enc/webp_enc.js' {
  const factory: EmscriptenFactory;
  export default factory;
}
declare module '@jsquash/webp/codec/enc/webp_enc_simd.js' {
  const factory: EmscriptenFactory;
  export default factory;
}
declare module '@jsquash/avif/codec/enc/avif_enc.js' {
  const factory: EmscriptenFactory;
  export default factory;
}
declare module '@jsquash/jpeg/meta.js' {
  export const defaultOptions: Record<string, unknown>;
}
declare module '@jsquash/webp/meta.js' {
  export const defaultOptions: Record<string, unknown>;
}
declare module '@jsquash/avif/meta.js' {
  export const defaultOptions: Record<string, unknown>;
}
declare module '@jsquash/png/codec/pkg/squoosh_png.js' {
  export default function init(module: WebAssembly.Module): Promise<unknown>;
  export function encode(data: Uint8Array, width: number, height: number, bitDepth: number): Uint8Array;
  export function decode(data: Uint8Array): ImageData;
}
declare module '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js' {
  export default function init(module: WebAssembly.Module): Promise<unknown>;
  export function optimise(data: Uint8Array, level: number, interlace: boolean, optimizeAlpha: boolean): Uint8Array;
  export function optimise_raw(
    data: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    level: number,
    interlace: boolean,
    optimizeAlpha: boolean,
  ): Uint8Array;
}
declare module '@jsquash/resize/lib/resize/pkg/squoosh_resize.js' {
  export default function init(module: WebAssembly.Module): Promise<unknown>;
  export function resize(
    input: Uint8Array,
    inputWidth: number,
    inputHeight: number,
    outputWidth: number,
    outputHeight: number,
    typeIndex: number,
    premultiply: boolean,
    colorSpaceConversion: boolean,
  ): Uint8ClampedArray;
}
