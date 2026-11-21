import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, extensionFor, sanitizeSettings } from '../src/shared/settings.ts';

test('nothing saved gives the defaults, with quality 80', () => {
  assert.deepEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.quality, 80);
});

test('valid saved settings are kept', () => {
  const s = { ...DEFAULT_SETTINGS, format: 'WEBP', quality: 70, lossless: true, jpegBackground: '#ABCDEF' };
  const out = sanitizeSettings(s);
  assert.equal(out.format, 'WEBP');
  assert.equal(out.quality, 70);
  assert.equal(out.lossless, true);
  assert.equal(out.jpegBackground, '#abcdef');
});

test('bad values fall back to defaults one by one', () => {
  const out = sanitizeSettings({ format: 'GIF', quality: 500, quantColors: -3, jpegBackground: 'red', chroma: 'x', oxipng: 'yes' });
  assert.equal(out.format, 'JPEG');
  assert.equal(out.quality, 80);
  assert.equal(out.quantColors, 0);
  assert.equal(out.jpegBackground, '#ffffff');
  assert.equal(out.chroma, '420');
  assert.equal(out.oxipng, true);
});

test('extensions', () => {
  assert.equal(extensionFor('JPEG'), 'jpg');
  assert.equal(extensionFor('WEBP'), 'webp');
  assert.equal(extensionFor('PNG'), 'png');
  assert.equal(extensionFor('PNG-lossless-oxipng'), 'png');
});
