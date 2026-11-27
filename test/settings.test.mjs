import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, extensionFor, fitWidth, sanitizeSettings } from '../src/shared/settings.ts';

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
  assert.equal(extensionFor('AVIF'), 'avif');
  assert.equal(extensionFor('PNG'), 'png');
  assert.equal(extensionFor('PNG-lossless-oxipng'), 'png');
});

test('max width is a whole number between 0 and 16384', () => {
  assert.equal(sanitizeSettings({ maxWidth: 1920 }).maxWidth, 1920);
  assert.equal(sanitizeSettings({ maxWidth: 1919.6 }).maxWidth, 1920);
  assert.equal(sanitizeSettings({ maxWidth: -5 }).maxWidth, 0);
  assert.equal(sanitizeSettings({ maxWidth: 99999 }).maxWidth, 0);
  assert.equal(sanitizeSettings({ format: 'AVIF' }).format, 'AVIF');
});

test('fitWidth keeps the aspect ratio and never upscales', () => {
  assert.deepEqual(fitWidth(4000, 3000, 1920), { width: 1920, height: 1440 });
  assert.equal(fitWidth(1000, 500, 1920), null);
  assert.equal(fitWidth(1000, 500, 0), null);
  assert.deepEqual(fitWidth(5000, 1, 100), { width: 100, height: 1 });
});
