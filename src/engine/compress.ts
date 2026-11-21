// Compresses one exported PNG into the chosen format.

import { quantizeRaw } from './quantize';
import { decodePng, encodeJpeg, encodePng, encodeWebp, optimisePng, optimisePngRaw, type RawImage } from './codecs';
import { flattenAlpha, hasTransparency, parseHexColor } from '../shared/pixels';
import type { OutputFormat } from '../shared/settings';

export interface CompressOptions {
  format: OutputFormat;
  quality: number;
  lossless: boolean;
  chroma: '420' | '444';
  quantColors: number;
  oxipng: boolean;
  jpegBackground: string;
}

export interface CompressResult {
  bytes: Uint8Array;
  ext: string;
  mime: string;
  /** The source image had transparent pixels. */
  hasAlpha: boolean;
}

export async function compressImage(pngBytes: Uint8Array, opts: CompressOptions): Promise<CompressResult> {
  if (opts.format === 'PNG-lossless-oxipng') {
    // Fast path: optimise the PNG Figma gave us without decoding it ourselves.
    // (hasAlpha only matters for JPEG, so it isn't worked out here.)
    const bytes = await optimisePng(pngBytes);
    return { bytes, ext: 'png', mime: 'image/png', hasAlpha: false };
  }

  let img: RawImage = await decodePng(pngBytes);
  const hasAlpha = hasTransparency(img.data);

  switch (opts.format) {
    case 'JPEG': {
      if (hasAlpha) flattenAlpha(img.data, parseHexColor(opts.jpegBackground));
      const bytes = await encodeJpeg(img, { quality: Math.round(opts.quality), chroma: opts.chroma });
      return { bytes, ext: 'jpg', mime: 'image/jpeg', hasAlpha };
    }
    case 'WEBP': {
      const quality = opts.lossless ? 100 : Math.round(opts.quality);
      const bytes = await encodeWebp(img, { quality, lossless: opts.lossless });
      return { bytes, ext: 'webp', mime: 'image/webp', hasAlpha };
    }
    case 'PNG': {
      if (opts.quantColors > 0) img = quantizeRaw(img, opts.quantColors);
      const bytes = opts.oxipng ? await optimisePngRaw(img) : await encodePng(img);
      return { bytes, ext: 'png', mime: 'image/png', hasAlpha };
    }
    default:
      throw new Error(`Unsupported format: ${String(opts.format)}`);
  }
}
