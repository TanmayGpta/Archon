// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimalChange } from './textChange.ts';

const apply = (prev, { from, to, insert }) => prev.slice(0, from) + insert + prev.slice(to);

test('minimalChange: identical texts need no change', () => {
  assert.deepEqual(minimalChange('abc', 'abc'), { from: 3, to: 3, insert: '' });
});

test('minimalChange: replaces only the differing middle', () => {
  assert.deepEqual(minimalChange('a = 1\nb = 2\n', 'a = 1\nb = 3\n'), { from: 10, to: 11, insert: '3' });
});

test('minimalChange: pure insertion and pure deletion', () => {
  assert.deepEqual(minimalChange('ac', 'abc'), { from: 1, to: 1, insert: 'b' });
  assert.deepEqual(minimalChange('abc', 'ac'), { from: 1, to: 2, insert: '' });
});

test('minimalChange: from and to empty', () => {
  assert.deepEqual(minimalChange('', 'new'), { from: 0, to: 0, insert: 'new' });
  assert.deepEqual(minimalChange('old', ''), { from: 0, to: 3, insert: '' });
});

test('minimalChange: repeated characters do not overlap prefix and suffix', () => {
  for (const [a, b] of [['aaa', 'aa'], ['aa', 'aaaa'], ['abab', 'ab'], ['x\n\n', 'x\n\n\n']]) {
    const change = minimalChange(a, b);
    assert.ok(change.from <= change.to, `${a} -> ${b}`);
    assert.equal(apply(a, change), b);
  }
});

test('minimalChange: applying the change always yields the target', () => {
  const pairs = [
    ['def f():\n    return 1\n', 'def f(x):\n    return x\n'],
    ['line1\nline2\nline3', 'line1\nline3'],
    ['', ''],
    ['same', 'different entirely'],
  ];
  for (const [a, b] of pairs) assert.equal(apply(a, minimalChange(a, b)), b);
});
