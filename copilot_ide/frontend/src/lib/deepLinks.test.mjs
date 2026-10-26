import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConformanceLink, parseArchitectLink, parseIdeLink, conformanceUrl, ideUrl, architectUrl, toQuery } from './deepLinks.ts';

const q = s => new URLSearchParams(s);

test('conformance link: path, view alias, focus', () => {
  assert.deepEqual(parseConformanceLink(q('path=/abs/app&view=graph&focus=app.billing')), {
    path: '/abs/app', blueprint: undefined, view: 'network', focus: 'app.billing',
  });
  assert.equal(parseConformanceLink(q('view=violations')).view, 'violations');
});

test('unknown views are ignored, not passed through', () => {
  assert.equal(parseConformanceLink(q('view=<script>')).view, undefined);
  assert.equal(parseArchitectLink(q('view=nope')).view, undefined);
  assert.equal(parseArchitectLink(q('view=atam')).view, 'atam');
});

test('ide link: leading slashes trimmed, line must be a positive integer', () => {
  assert.deepEqual(parseIdeLink(q('project=/w&file=/src/x.py&line=42')), { project: '/w', file: 'src/x.py', line: 42 });
  assert.equal(parseIdeLink(q('line=0')).line, undefined);
  assert.equal(parseIdeLink(q('line=3.5')).line, undefined);
  assert.equal(parseIdeLink(q('line=abc')).line, undefined);
});

test('urls round-trip through the parsers', () => {
  const c = { path: 'C:/My Projects/app', view: 'orbit', focus: 'a.b' };
  assert.deepEqual(parseConformanceLink(new URL(`http://x${conformanceUrl(c)}`).searchParams), { ...c, blueprint: undefined });
  const i = { project: '/workspace', file: 'src/a b.ts', line: 7 };
  assert.deepEqual(parseIdeLink(new URL(`http://x${ideUrl(i)}`).searchParams), i);
  assert.equal(architectUrl({ view: 'diagram' }), '/architect?view=diagram');
});

test('empty values are dropped from the query', () => {
  assert.equal(toQuery({ path: '', view: undefined, focus: null }), '');
  assert.equal(ideUrl({}), '/ide');
});
