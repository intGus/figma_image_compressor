import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenAlpha, hasTransparency, parseHexColor } from '../src/shared/pixels.ts';

test('parseHexColor', () => {
  assert.deepEqual(parseHexColor('#ff8000'), { r: 255, g: 128, b: 0 });
  assert.deepEqual(parseHexColor('nope'), { r: 255, g: 255, b: 255 });
});

test('flattenAlpha composites onto the background', () => {
  // opaque red, fully transparent, half-transparent black
  const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128]);
  flattenAlpha(px, { r: 255, g: 255, b: 255 });
  assert.deepEqual([...px], [255, 0, 0, 255, 255, 255, 255, 255, 127, 127, 127, 255]);
});

test('hasTransparency', () => {
  assert.equal(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])), false);
  assert.equal(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254])), true);
});
