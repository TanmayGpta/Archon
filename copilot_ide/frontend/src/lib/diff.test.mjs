// Characterization tests for the agent's SEARCH/REPLACE diff engine.
// Run: npm test  (Node's built-in runner; Node strips the types from diff.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiffBlocks, preprocessMarkdownDiffs, applyDiffBlocks } from './diff.ts';

const block = (search, replace) => `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;

// ── parseDiffBlocks ──

test('parseDiffBlocks: empty text has no blocks', () => {
  assert.deepEqual(parseDiffBlocks(''), []);
  assert.deepEqual(parseDiffBlocks('just prose, no markers'), []);
});

test('parseDiffBlocks: one block', () => {
  assert.deepEqual(parseDiffBlocks(block('a = 1', 'a = 2')), [{ search: 'a = 1', replace: 'a = 2' }]);
});

test('parseDiffBlocks: several blocks in order, with prose between', () => {
  const text = `First:\n${block('a', 'b')}\nThen:\n${block('c', 'd')}\n`;
  assert.deepEqual(parseDiffBlocks(text), [
    { search: 'a', replace: 'b' },
    { search: 'c', replace: 'd' },
  ]);
});

test('parseDiffBlocks: CRLF line endings', () => {
  const text = block('x = 1', 'x = 2').replace(/\n/g, '\r\n');
  assert.deepEqual(parseDiffBlocks(text), [{ search: 'x = 1', replace: 'x = 2' }]);
});

test('parseDiffBlocks: multi-line search and replace keep inner newlines', () => {
  assert.deepEqual(parseDiffBlocks(block('def f():\n    return 1', 'def f():\n    return 2')), [
    { search: 'def f():\n    return 1', replace: 'def f():\n    return 2' },
  ]);
});

test('parseDiffBlocks: missing REPLACE marker at end of a streamed response', () => {
  const text = '<<<<<<< SEARCH\na = 1\n=======\na = 2';
  assert.deepEqual(parseDiffBlocks(text), [{ search: 'a = 1', replace: 'a = 2' }]);
});

test('parseDiffBlocks: empty replace means delete', () => {
  assert.deepEqual(parseDiffBlocks('<<<<<<< SEARCH\nx\n=======\n>>>>>>> REPLACE'), [{ search: 'x', replace: '' }]);
  assert.deepEqual(parseDiffBlocks('<<<<<<< SEARCH\nx\n=======\n>>>>>>> REPLACE\n'), [{ search: 'x', replace: '' }]);
});

test('parseDiffBlocks: shorter markers are accepted', () => {
  assert.deepEqual(parseDiffBlocks('<<<< SEARCH\na\n====\nb\n>>>> REPLACE'), [{ search: 'a', replace: 'b' }]);
});

// ── applyDiffBlocks ──

test('applyDiffBlocks: no blocks is a failure with an explanation', () => {
  assert.deepEqual(applyDiffBlocks('abc', 'nothing here'), {
    success: false,
    newContent: 'abc',
    appliedCount: 0,
    errors: ['No valid <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks found.'],
  });
});

test('applyDiffBlocks: tier 1, exact match', () => {
  assert.deepEqual(applyDiffBlocks('a = 1\nb = 2', block('a = 1', 'a = 2')), {
    success: true,
    newContent: 'a = 2\nb = 2',
    appliedCount: 1,
    errors: [],
  });
});

test('applyDiffBlocks: tier 1 replaces only the first occurrence', () => {
  assert.equal(applyDiffBlocks('x\nx', block('x', 'y')).newContent, 'y\nx');
});

test('applyDiffBlocks: blocks apply in sequence to the updated content', () => {
  const diff = `${block('a', 'b')}\n${block('b', 'c')}`;
  const result = applyDiffBlocks('a', diff);
  assert.equal(result.newContent, 'c');
  assert.equal(result.appliedCount, 2);
});

test('applyDiffBlocks: tier 2, indentation-tolerant match re-indents the replacement', () => {
  const file = 'class A:\n    def f(self):\n        return 1';
  const result = applyDiffBlocks(file, block('def f(self):\n    return 1', 'def f(self):\n    return 2'));
  assert.equal(result.newContent, 'class A:\n    def f(self):\n        return 2');
  assert.equal(result.appliedCount, 1);
});

test('applyDiffBlocks: tier 3, first/last line anchors replace the span between', () => {
  const result = applyDiffBlocks('a\nb\nc\nd', block('a\nX\nd', 'a\nZ\nd'));
  assert.equal(result.newContent, 'a\nZ\nd');
  assert.equal(result.appliedCount, 1);
});

test('applyDiffBlocks: unmatched block reports its number and leaves content alone', () => {
  assert.deepEqual(applyDiffBlocks('abc', block('zzz', 'y')), {
    success: false,
    newContent: 'abc',
    appliedCount: 0,
    errors: ['Diff block #1 could not be matched in active file.'],
  });
});

test('applyDiffBlocks: partial success when some blocks match', () => {
  const result = applyDiffBlocks('a', `${block('a', 'b')}\n${block('zzz', 'y')}`);
  assert.equal(result.success, true);
  assert.equal(result.newContent, 'b');
  assert.deepEqual(result.errors, ['Diff block #2 could not be matched in active file.']);
});

test('applyDiffBlocks: whitespace-only search is skipped, not an error', () => {
  const result = applyDiffBlocks('abc', '<<<<<<< SEARCH\n   \n=======\nnew\n>>>>>>> REPLACE');
  assert.equal(result.success, false);
  assert.equal(result.newContent, 'abc');
  assert.deepEqual(result.errors, []);
});

// ── preprocessMarkdownDiffs ──

test('preprocessMarkdownDiffs: empty and plain text pass through', () => {
  assert.equal(preprocessMarkdownDiffs(''), '');
  assert.equal(preprocessMarkdownDiffs('Just text.'), 'Just text.');
});

test('preprocessMarkdownDiffs: fenced code is never touched', () => {
  const fenced = '```diff\n' + block('a', 'b') + '\n```';
  assert.equal(preprocessMarkdownDiffs(fenced), fenced);
  const py = 'Here:\n```py\nx = 1\n```';
  assert.equal(preprocessMarkdownDiffs(py), py);
});

test('preprocessMarkdownDiffs: a bare block gets wrapped in a diff fence', () => {
  assert.equal(
    preprocessMarkdownDiffs(`Change:\n${block('a', 'b')}\nDone.`),
    'Change:\n\n```diff\n' + block('a', 'b') + '\n```\n\nDone.',
  );
});
