import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, naturalCompare, shortenString } from '../src/shared/format.ts';

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(3 * 1048576), '3.0 MB');
});

test('shortenString keeps short names and trims long ones to the limit', () => {
  assert.equal(shortenString('short'), 'short');
  const long = 'x'.repeat(80);
  assert.equal(shortenString(long).length, 50);
});

test('naturalCompare orders numbers naturally', () => {
  assert.deepEqual(['Image 10', 'Image 2', 'Image 1'].sort(naturalCompare), ['Image 1', 'Image 2', 'Image 10']);
});
