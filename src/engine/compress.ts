// Compresses one exported PNG into the chosen format.

import { quantizeRaw } from './quantize';
import {
  decodePng,
  encodeAvif,
  encodeJpeg,
  encodePng,
  encodeWebp,
  optimisePng,
  optimisePngRaw,
  resizeImage,
  type RawImage,
} from './codecs';
import { flattenAlpha, hasTransparency, parseHexColor } from '../shared/pixels';
import { fitWidth, type OutputFormat } from '../shared/settings';

export interface CompressOptions {
  format: OutputFormat;
  quality: number;
  lossless: boolean;
  chroma: '420' | '444';
  quantColors: number;
  oxipng: boolean;
  jpegBackground: string;
  /** Downscale wider images to this width; 0 = keep size. */
  maxWidth: number;
}

export interface CompressResult {
  bytes: Uint8Array;
  ext: string;
  mime: string;
  /** The source image had transparent pixels. */
  hasAlpha: boolean;
  /** Output size in pixels. */
  width: number;
  height: number;
}

/** Reads width and height from a PNG header without decoding it. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

export async function compressImage(pngBytes: Uint8Array, opts: CompressOptions): Promise<CompressResult> {
  const size = pngSize(pngBytes);
  const target = fitWidth(size.width, size.height, opts.maxWidth);

  if (opts.format === 'PNG-lossless-oxipng' && !target) {
    // Fast path: optimise the PNG Figma gave us without decoding it ourselves.
    // (hasAlpha only matters for JPEG, so it isn't worked out here.)
    const bytes = await optimisePng(pngBytes);
    return { bytes, ext: 'png', mime: 'image/png', hasAlpha: false, ...size };
  }

  let img: RawImage = await decodePng(pngBytes);
  const hasAlpha = hasTransparency(img.data);
  if (target) img = await resizeImage(img, target.width, target.height);
  const dims = { width: img.width, height: img.height };

  switch (opts.format) {
    case 'JPEG': {
      if (hasAlpha) flattenAlpha(img.data, parseHexColor(opts.jpegBackground));
      const bytes = await encodeJpeg(img, { quality: Math.round(opts.quality), chroma: opts.chroma });
      return { bytes, ext: 'jpg', mime: 'image/jpeg', hasAlpha, ...dims };
    }
    case 'WEBP': {
      const quality = opts.lossless ? 100 : Math.round(opts.quality);
      const bytes = await encodeWebp(img, { quality, lossless: opts.lossless });
      return { bytes, ext: 'webp', mime: 'image/webp', hasAlpha, ...dims };
    }
    case 'AVIF': {
      const bytes = await encodeAvif(img, { quality: Math.round(opts.quality), lossless: opts.lossless });
      return { bytes, ext: 'avif', mime: 'image/avif', hasAlpha, ...dims };
    }
    case 'PNG': {
      if (opts.quantColors > 0) img = quantizeRaw(img, opts.quantColors);
      const bytes = opts.oxipng ? await optimisePngRaw(img) : await encodePng(img);
      return { bytes, ext: 'png', mime: 'image/png', hasAlpha, ...dims };
    }
    case 'PNG-lossless-oxipng': {
      const bytes = await optimisePngRaw(img);
      return { bytes, ext: 'png', mime: 'image/png', hasAlpha, ...dims };
    }
    default:
      throw new Error(`Unsupported format: ${String(opts.format)}`);
  }
}
