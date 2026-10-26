import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorDetail } from './api.ts';

test('errorDetail reads FastAPI detail and ends it with a period', () => {
  assert.equal(errorDetail('{"detail":"Directory not found"}'), 'Directory not found.');
  assert.equal(errorDetail('{"detail":"Already exists!"}'), 'Already exists!');
});

test('errorDetail falls back to trimmed raw text, then a generic line', () => {
  assert.equal(errorDetail('  Bad Gateway \n'), 'Bad Gateway');
  assert.equal(errorDetail('{"detail":[{"msg":"x"}]}'), '{"detail":[{"msg":"x"}]}');
  assert.equal(errorDetail(''), 'The server returned an error.');
  assert.equal(errorDetail('x'.repeat(500)).length, 200);
});
