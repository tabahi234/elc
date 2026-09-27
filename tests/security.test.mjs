import test from 'node:test';
import assert from 'node:assert/strict';
import { safeLink } from '../src/lib/validate.js';
import { timestampMillis } from '../src/lib/timestamps.js';

test('external links reject executable, deceptive and nonstandard URLs', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,hello', 'http://drive.google.com/a',
    'https://drive.google.com.evil.test/a', 'https://drive.google.com@evil.test/a',
    'https://evil.test@drive.google.com/a', 'https://drive.google.com:8443/a',
    'https://drive.google.com\\@evil.test/a', 'https://drive.google.com/\nfoo',
    {}, ['https://drive.google.com/a'],
  ]) assert.equal(safeLink(url, 'drive'), null, JSON.stringify(url));
  assert.equal(safeLink('https://drive.google.com/file/d/123/view', 'drive'), 'https://drive.google.com/file/d/123/view');
  assert.equal(safeLink('https://classroom.google.com/c/123', 'classroom'), 'https://classroom.google.com/c/123');
  assert.equal(safeLink('https://drive.google.com/a', 'classroom'), null);
  assert.equal(safeLink('https://drive.google.com/a', 'unknown'), null);
});

test('new server timestamps and legacy records use the same chronological ordering', () => {
  const date = '2026-09-27T12:00:00.000Z';
  assert.equal(timestampMillis({ toMillis: () => Date.parse(date) }), timestampMillis(date));
  assert.equal(timestampMillis(null), 0);
  assert.equal(timestampMillis('invalid'), 0);
});
