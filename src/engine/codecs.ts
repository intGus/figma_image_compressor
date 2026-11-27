// Thin wrappers around the jSquash codecs, initialised from the bundled .wasm.
// Each codec is set up once, on first use.

import { simd } from 'wasm-feature-detect';
import { compileWasm } from './wasm';

import mozjpegEncFactory from '@jsquash/jpeg/codec/enc/mozjpeg_enc.js';
import { defaultOptions as jpegDefaults } from '@jsquash/jpeg/meta.js';
import mozjpegEncWasm from 'wasm-gz:@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm';

import webpEncFactory from '@jsquash/webp/codec/enc/webp_enc.js';
import webpEncSimdFactory from '@jsquash/webp/codec/enc/webp_enc_simd.js';
import { defaultOptions as webpDefaults } from '@jsquash/webp/meta.js';
import webpEncWasm from 'wasm-gz:@jsquash/webp/codec/enc/webp_enc.wasm';
import webpEncSimdWasm from 'wasm-gz:@jsquash/webp/codec/enc/webp_enc_simd.wasm';

import initPng, { encode as pngEncodeRaw, decode as pngDecodeRaw } from '@jsquash/png/codec/pkg/squoosh_png.js';
import pngWasm from 'wasm-gz:@jsquash/png/codec/pkg/squoosh_png_bg.wasm';

import avifEncFactory from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions as avifDefaults } from '@jsquash/avif/meta.js';
import avifEncWasm from 'wasm-gz:@jsquash/avif/codec/enc/avif_enc.wasm';

import initResize, { resize as wasmResize } from '@jsquash/resize/lib/resize/pkg/squoosh_resize.js';
import resizeWasm from 'wasm-gz:@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm';

import initOxipng, { optimise as oxiOptimise, optimise_raw as oxiOptimiseRaw } from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js';
import oxipngWasm from 'wasm-gz:@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm';

export interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Starts an Emscripten codec with an already compiled module, so it never tries to fetch a .wasm file. */
function startEmscripten(factory: EmscriptenFactory, module: WebAssembly.Module): Promise<any> {
  return factory({
    noInitialRun: true,
    instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) {
      WebAssembly.instantiate(module, imports).then(done);
      return {}; // async instantiation
    },
  });
}

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => {
    if (!p) {
      p = fn();
      p.catch(() => (p = undefined));
    }
    return p;
  };
}

const jpegEncoder = once(async () => startEmscripten(mozjpegEncFactory, await compileWasm('mozjpeg_enc', mozjpegEncWasm)));

const webpEncoder = once(async () => {
  if (await simd()) {
    return startEmscripten(webpEncSimdFactory, await compileWasm('webp_enc_simd', webpEncSimdWasm));
  }
  return startEmscripten(webpEncFactory, await compileWasm('webp_enc', webpEncWasm));
});

// Single-threaded AVIF build: the multi-threaded one needs SharedArrayBuffer, which Figma's plugin iframe doesn't allow.
const avifEncoder = once(async () => startEmscripten(avifEncFactory, await compileWasm('avif_enc', avifEncWasm)));
const resizeReady = once(async () => initResize(await compileWasm('resize', resizeWasm)));
const pngReady = once(async () => initPng(await compileWasm('png', pngWasm)));
const oxipngReady = once(async () => initOxipng(await compileWasm('oxipng', oxipngWasm)));

export async function encodeJpeg(img: RawImage, opts: { quality: number; chroma: '420' | '444' }): Promise<Uint8Array> {
  const enc = await jpegEncoder();
  const out = enc.encode(img.data, img.width, img.height, {
    ...jpegDefaults,
    quality: opts.quality,
    // mozjpeg: chroma_subsample 1 = 4:4:4, 2 = 4:2:0; auto_subsample must be off for the choice to apply
    auto_subsample: false,
    chroma_subsample: opts.chroma === '444' ? 1 : 2,
  });
  if (!out) throw new Error('JPEG encoding failed');
  return new Uint8Array(out);
}

export async function encodeWebp(img: RawImage, opts: { quality: number; lossless: boolean }): Promise<Uint8Array> {
  const enc = await webpEncoder();
  const out = enc.encode(img.data, img.width, img.height, {
    ...webpDefaults,
    quality: opts.quality,
    lossless: opts.lossless ? 1 : 0,
  });
  if (!out) throw new Error('WebP encoding failed');
  return new Uint8Array(out);
}

export async function encodeAvif(img: RawImage, opts: { quality: number; lossless: boolean }): Promise<Uint8Array> {
  const enc = await avifEncoder();
  const options = opts.lossless
    ? { ...avifDefaults, lossless: true, quality: 100, qualityAlpha: -1, subsample: 3 }
    : { ...avifDefaults, quality: opts.quality };
  const out = enc.encode(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height, options);
  if (!out) throw new Error('AVIF encoding failed');
  return new Uint8Array(out);
}

const LANCZOS3 = 3; // index into squoosh_resize's methods: triangle, catrom, mitchell, lanczos3

/** High-quality downscale (Lanczos3, premultiplied alpha, linear RGB). */
export async function resizeImage(img: RawImage, width: number, height: number): Promise<RawImage> {
  await resizeReady();
  const src = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  const out = wasmResize(src, img.width, img.height, width, height, LANCZOS3, true, true);
  return { data: new Uint8ClampedArray(out.buffer, out.byteOffset, out.byteLength), width, height };
}

export async function decodePng(bytes: Uint8Array): Promise<RawImage> {
  await pngReady();
  const img = pngDecodeRaw(bytes);
  if (!img) throw new Error('PNG decoding failed');
  return { data: img.data, width: img.width, height: img.height };
}

export async function encodePng(img: RawImage): Promise<Uint8Array> {
  await pngReady();
  const out = pngEncodeRaw(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height, 8);
  if (!out) throw new Error('PNG encoding failed');
  return out;
}

const OXIPNG_LEVEL = 3;

/** Lossless re-optimisation of an existing PNG file. */
export async function optimisePng(pngBytes: Uint8Array): Promise<Uint8Array> {
  await oxipngReady();
  return oxiOptimise(pngBytes, OXIPNG_LEVEL, false, false);
}

/** Encodes raw pixels straight to an optimised PNG. */
export async function optimisePngRaw(img: RawImage): Promise<Uint8Array> {
  await oxipngReady();
  return oxiOptimiseRaw(img.data, img.width, img.height, OXIPNG_LEVEL, false, false);
}
