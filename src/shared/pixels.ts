// Pixel helpers that work on RGBA byte arrays. Pure, unit tested in test/pixels.test.ts.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseHexColor(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 255, g: 255, b: 255 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** True when any pixel is not fully opaque. */
export function hasTransparency(data: ArrayLike<number>): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

/**
 * Composites straight-alpha RGBA pixels onto a solid background, in place:
 * rgb = rgb * a + bg * (1 - a), a = 255. JPEG has no alpha channel, so without
 * this transparent areas come out black.
 */
export function flattenAlpha(data: Uint8Array | Uint8ClampedArray, bg: RGB): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 255) continue;
    const t = a / 255;
    data[i] = Math.round(data[i] * t + bg.r * (1 - t));
    data[i + 1] = Math.round(data[i + 1] * t + bg.g * (1 - t));
    data[i + 2] = Math.round(data[i + 2] * t + bg.b * (1 - t));
    data[i + 3] = 255;
  }
}
