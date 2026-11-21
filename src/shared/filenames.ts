// File naming for exported images. Pure functions, unit tested in test/filenames.test.ts.

export type ExportConstraintType = 'SCALE' | 'WIDTH' | 'HEIGHT';

/** Characters that aren't allowed in file names on common systems become "_". */
export function sanitizeName(s: string): string {
  return String(s).replace(/[\/\\?%*:|"<>\x00-\x1f]/g, '_');
}

/**
 * Figma-style suffix: the export setting's own suffix wins; otherwise a scale other
 * than 1 gives "@2x", "@0.5x" and so on. Width/height constraints get no automatic suffix.
 */
export function resolveSuffix(type: ExportConstraintType, value: number, explicitSuffix?: string): string {
  if (explicitSuffix) return explicitSuffix;
  if (type === 'SCALE' && value !== 1) return `@${value}x`;
  return '';
}

/** Short label for the size column: "2x", "w1920", "h600". */
export function constraintLabel(type: ExportConstraintType, value: number): string {
  if (type === 'WIDTH') return `w${value}`;
  if (type === 'HEIGHT') return `h${value}`;
  return `${value}x`;
}

/**
 * Makes every file name unique, in order: "Image.jpg", "Image-2.jpg", "Image-3.jpg".
 * Compared case-insensitively because macOS and Windows treat "image.jpg" and
 * "Image.jpg" as the same file when the ZIP is extracted.
 */
export function uniqueFileNames(entries: ReadonlyArray<{ base: string; ext: string }>): string[] {
  const used = new Set<string>();
  return entries.map(({ base, ext }) => {
    const safeBase = sanitizeName(base) || 'image';
    let candidate = `${safeBase}.${ext}`;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${safeBase}-${n}.${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** ZIP names always end in .zip. */
export function zipFileName(input: string): string {
  const name = sanitizeName(input.trim()) || 'images';
  return /\.zip$/i.test(name) ? name : `${name}.zip`;
}
