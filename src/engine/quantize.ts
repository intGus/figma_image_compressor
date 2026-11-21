// Reduces an image to a limited palette (lossy PNG), using image-q.

import { applyPaletteSync, buildPaletteSync, utils } from 'image-q';
import type { RawImage } from './codecs';

export function quantizeRaw(img: RawImage, colors: number): RawImage {
  const pc = utils.PointContainer.fromUint8Array(img.data, img.width, img.height);
  const palette = buildPaletteSync([pc], { colors: Math.max(2, Math.min(256, Math.round(colors))) });
  const out = applyPaletteSync(pc, palette, { imageQuantization: 'floyd-steinberg' });
  return { data: new Uint8ClampedArray(out.toUint8Array()), width: img.width, height: img.height };
}
