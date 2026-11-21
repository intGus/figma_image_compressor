// Runs the real WebAssembly codecs in Node against small generated images.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { engineOptions } from '../scripts/build.mjs';

// Browsers have ImageData; Node doesn't. The PNG decoder constructs one.
globalThis.ImageData ??= class ImageData {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
};

let E;
before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fic-engine-'));
  const outfile = join(dir, 'engine.mjs');
  await esbuild.build({
    ...engineOptions,
    entryPoints: [new URL('./engine-entry.ts', import.meta.url).pathname],
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    outfile,
  });
  E = await import(pathToFileURL(outfile).href);
});

/** w×h image: left half opaque red, right half fully transparent. */
function halfTransparent(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (x < w / 2) { data[i] = 255; data[i + 3] = 255; }
  }
  return { data, width: w, height: h };
}

const base = { quality: 80, lossless: false, chroma: '420', quantColors: 0, oxipng: true, jpegBackground: '#ffffff' };

test('JPEG: transparent pixels are filled with the background colour, not black', async () => {
  const png = await E.encodePng(halfTransparent(32, 16));
  const r = await E.compressImage(png, { ...base, format: 'JPEG' });
  assert.equal(r.ext, 'jpg');
  assert.equal(r.hasAlpha, true);
  assert.deepEqual([...r.bytes.slice(0, 2)], [0xff, 0xd8]);
  const img = await E.decodeJpeg(r.bytes);
  const px = (x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
  const right = px(28, 8);
  assert.ok(right.every((c) => c > 245), `right side should be white, got ${right}`);
  const left = px(3, 8);
  assert.ok(left[0] > 200 && left[1] < 60 && left[2] < 60, `left side should stay red, got ${left}`);
});

test('JPEG: a custom background colour is used', async () => {
  const png = await E.encodePng(halfTransparent(32, 16));
  const r = await E.compressImage(png, { ...base, format: 'JPEG', jpegBackground: '#0000ff' });
  const img = await E.decodeJpeg(r.bytes);
  const i = (8 * img.width + 28) * 4;
  assert.ok(img.data[i + 2] > 200 && img.data[i] < 60, 'right side should be blue');
});

test('WebP, PNG and PNG-optimise produce valid files', async () => {
  const png = await E.encodePng(halfTransparent(32, 16));
  const webp = await E.compressImage(png, { ...base, format: 'WEBP' });
  assert.equal(new TextDecoder().decode(webp.bytes.slice(8, 12)), 'WEBP');
  const lossless = await E.compressImage(png, { ...base, format: 'WEBP', lossless: true });
  assert.equal(new TextDecoder().decode(lossless.bytes.slice(8, 12)), 'WEBP');
  for (const opts of [{ format: 'PNG' }, { format: 'PNG', quantColors: 8 }, { format: 'PNG', oxipng: false }, { format: 'PNG-lossless-oxipng' }]) {
    const r = await E.compressImage(png, { ...base, ...opts });
    assert.equal(r.ext, 'png');
    const back = await E.decodePng(r.bytes);
    assert.equal(back.width, 32);
    assert.equal(back.height, 16);
    assert.equal(back.data[3], 255, 'PNG keeps alpha (opaque pixel)');
    assert.equal(back.data[(8 * 32 + 28) * 4 + 3], 0, 'PNG keeps alpha (transparent pixel)');
  }
});
