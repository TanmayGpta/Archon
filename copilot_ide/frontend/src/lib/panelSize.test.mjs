import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, readSize, writeSize, clearSize, subscribeSizes } from './panelSize.ts';

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
    data,
  };
};

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) clearSize(k);
});

test('clamp keeps a value inside the range', () => {
  assert.equal(clamp(50, 100, 300), 100);
  assert.equal(clamp(500, 100, 300), 300);
  assert.equal(clamp(200, 100, 300), 200);
  assert.equal(clamp(200, 100, 50), 100, 'min wins when max < min');
});

test('readSize falls back when nothing is stored', () => {
  assert.equal(readSize('a', 260), 260);
});

test('writeSize persists a rounded size that readSize returns', () => {
  writeSize('b', 321.6);
  assert.equal(readSize('b', 260), 322);
  assert.equal(globalThis.localStorage.getItem('archon.panel.b'), '322');
});

test('a stored size survives a fresh cache (reload)', () => {
  globalThis.localStorage.setItem('archon.panel.c', '410');
  assert.equal(readSize('c', 260), 410);
});

test('garbage in storage is ignored', () => {
  globalThis.localStorage.setItem('archon.panel.d', 'wide');
  assert.equal(readSize('d', 260), 260);
});

test('storage that throws does not break sizing', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(readSize('e', 180), 180);
  writeSize('e', 240);
  assert.equal(readSize('e', 180), 240, 'kept in memory');
});

test('subscribers hear writes and resets, and can unsubscribe', () => {
  let calls = 0;
  const off = subscribeSizes(() => calls++);
  writeSize('f', 300);
  writeSize('f', 300); // unchanged: no notification
  clearSize('f');
  off();
  writeSize('f', 400);
  assert.equal(calls, 2);
  assert.equal(readSize('f', 260), 400);
});
