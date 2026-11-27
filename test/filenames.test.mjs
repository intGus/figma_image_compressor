import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constraintLabel, resolveSuffix, sanitizeName, uniqueFileNames, zipFileName } from '../src/shared/filenames.ts';

test('three layers named "Image" get unique names', () => {
  const names = uniqueFileNames([1, 2, 3].map(() => ({ base: 'Image', ext: 'jpg' })));
  assert.deepEqual(names, ['Image.jpg', 'Image-2.jpg', 'Image-3.jpg']);
});

test('names that differ only by case still collide (macOS/Windows)', () => {
  assert.deepEqual(uniqueFileNames([{ base: 'Logo', ext: 'png' }, { base: 'logo', ext: 'png' }]), ['Logo.png', 'logo-2.png']);
});

test('a generated name never overwrites a real layer called "Image-2"', () => {
  const names = uniqueFileNames([
    { base: 'Image', ext: 'jpg' },
    { base: 'Image-2', ext: 'jpg' },
    { base: 'Image', ext: 'jpg' },
  ]);
  assert.deepEqual(names, ['Image.jpg', 'Image-2.jpg', 'Image-3.jpg']);
  assert.equal(new Set(names).size, names.length);
});

test('different extensions do not collide', () => {
  assert.deepEqual(uniqueFileNames([{ base: 'A', ext: 'jpg' }, { base: 'A', ext: 'png' }]), ['A.jpg', 'A.png']);
});

test('unsafe characters are replaced and empty names get a fallback', () => {
  assert.equal(sanitizeName('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j');
  assert.deepEqual(uniqueFileNames([{ base: '', ext: 'png' }]), ['image.png']);
});

test('suffix follows Figma: explicit suffix wins, else @Nx for scale != 1', () => {
  assert.equal(resolveSuffix('SCALE', 1), '');
  assert.equal(resolveSuffix('SCALE', 2), '@2x');
  assert.equal(resolveSuffix('SCALE', 0.5), '@0.5x');
  assert.equal(resolveSuffix('SCALE', 2, '-retina'), '-retina');
  assert.equal(resolveSuffix('WIDTH', 1920), '');
});

test('constraint labels', () => {
  assert.equal(constraintLabel('SCALE', 2), '2x');
  assert.equal(constraintLabel('WIDTH', 1920), 'w1920');
  assert.equal(constraintLabel('HEIGHT', 600), 'h600');
});

test('ZIP names always end in .zip', () => {
  assert.equal(zipFileName('images.zip'), 'images.zip');
  assert.equal(zipFileName('export'), 'export.zip');
  assert.equal(zipFileName('  '), 'images.zip');
  assert.equal(zipFileName('My.ZIP'), 'My.ZIP');
});
