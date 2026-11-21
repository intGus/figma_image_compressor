// User settings, saved with figma.clientStorage by code.ts. Pure, unit tested in test/settings.test.ts.

export const FORMATS = ['JPEG', 'WEBP', 'AVIF', 'PNG', 'PNG-lossless-oxipng'] as const;
export type OutputFormat = (typeof FORMATS)[number];

export interface Settings {
  format: OutputFormat;
  /** 1–100. Used by JPEG and lossy WebP/AVIF. */
  quality: number;
  /** WebP/AVIF lossless. */
  lossless: boolean;
  chroma: '420' | '444';
  /** PNG palette size, 0 = keep full colour. */
  quantColors: number;
  oxipng: boolean;
  /** Colour that transparent pixels are filled with for JPEG, "#rrggbb". */
  jpegBackground: string;
  /** Downscale images wider than this many pixels; 0 = no limit. */
  maxWidth: number;
  zipName: string;
}

export const MAX_WIDTH_LIMIT = 16384;

export const DEFAULT_SETTINGS: Settings = {
  format: 'JPEG',
  quality: 80,
  lossless: false,
  chroma: '420',
  quantColors: 0,
  oxipng: true,
  jpegBackground: '#ffffff',
  maxWidth: 0,
  zipName: 'images.zip',
};

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Turns whatever was stored (possibly from an older version, or nothing) into valid settings. */
export function sanitizeSettings(input: unknown): Settings {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    format: (FORMATS as readonly string[]).includes(s.format as string) ? (s.format as OutputFormat) : d.format,
    quality: clampNumber(s.quality, 1, 100, d.quality),
    lossless: typeof s.lossless === 'boolean' ? s.lossless : d.lossless,
    chroma: s.chroma === '444' ? '444' : '420',
    quantColors: Math.round(clampNumber(s.quantColors, 0, 256, d.quantColors)),
    oxipng: typeof s.oxipng === 'boolean' ? s.oxipng : d.oxipng,
    jpegBackground:
      typeof s.jpegBackground === 'string' && /^#[0-9a-f]{6}$/i.test(s.jpegBackground)
        ? s.jpegBackground.toLowerCase()
        : d.jpegBackground,
    maxWidth: Math.round(clampNumber(s.maxWidth, 0, MAX_WIDTH_LIMIT, d.maxWidth)),
    zipName: typeof s.zipName === 'string' && s.zipName.trim() ? s.zipName : d.zipName,
  };
}

export function extensionFor(format: OutputFormat): string {
  if (format === 'JPEG') return 'jpg';
  if (format === 'WEBP') return 'webp';
  if (format === 'AVIF') return 'avif';
  return 'png';
}

/**
 * Size to downscale to so the width is at most maxWidth, keeping the aspect ratio.
 * Never upscales; returns null when no resize is needed.
 */
export function fitWidth(width: number, height: number, maxWidth: number): { width: number; height: number } | null {
  if (!maxWidth || width <= maxWidth) return null;
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}
