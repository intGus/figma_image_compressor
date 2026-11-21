// Runs the exact engine script that ships in dist/ui.html (the Web Worker source),
// the way the UI runs it when workers aren't available.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineSource } from '../scripts/build.mjs';
import { makePng } from './png-helper.mjs';

globalThis.ImageData ??= class ImageData {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
};

let engine;
before(async () => {
  const source = await buildEngineSource();
  new Function(source)();
  engine = globalThis.__ficEngine;
});

test('the shipped engine bundle answers ping and compresses', async () => {
  assert.deepEqual(await engine.handle({ type: 'ping' }), { type: 'pong' });

  const data = new Uint8ClampedArray(8 * 8 * 4).map((_, i) => [0, 200, 0, 128][i % 4]); // semi-transparent green
  const png = makePng(8, 8, data);
  const opts = { format: 'PNG', quality: 80, lossless: false, chroma: '420', quantColors: 0, oxipng: false, jpegBackground: '#ffffff', maxWidth: 0 };
  const r = await engine.handle({ type: 'compress', jobId: 7, bytes: png, options: { ...opts, format: 'JPEG' } });
  assert.equal(r.type, 'done', r.message);
  assert.equal(r.jobId, 7);
  assert.equal(r.ext, 'jpg');
  assert.deepEqual([...r.bytes.slice(0, 2)], [0xff, 0xd8]);
  assert.equal(r.hasAlpha, true);

  const bad = await engine.handle({ type: 'compress', jobId: 8, bytes: new Uint8Array([1, 2, 3]), options: opts });
  assert.equal(bad.type, 'error');
  assert.equal(bad.jobId, 8);
});
