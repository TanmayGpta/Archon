import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ptyUrl, inputMessage, resizeMessage, parsePtyEvent, isRunnerInfo, takeLegacyToken, RUNNER_URL } from './runner.ts';
import { githubAuth, githubRequest, hasGitHubToken, GITHUB_CALLS } from './github.ts';

test('runner defaults to loopback port 7337', () => {
  assert.equal(RUNNER_URL, 'http://127.0.0.1:7337');
});

test('pty url uses ws and carries the size', () => {
  assert.equal(ptyUrl(120, 30), 'ws://127.0.0.1:7337/pty?cols=120&rows=30');
  assert.equal(ptyUrl(80, 24, 'https://box:9'), 'wss://box:9/pty?cols=80&rows=24');
});

test('socket messages match the runner protocol', () => {
  assert.deepEqual(JSON.parse(inputMessage('ls\r')), { type: 'input', data: 'ls\r' });
  assert.deepEqual(JSON.parse(resizeMessage(100, 40)), { type: 'resize', cols: 100, rows: 40 });
  assert.deepEqual(parsePtyEvent('{"type":"exit","code":3}'), { type: 'exit', code: 3 });
  assert.equal(parsePtyEvent('{"type":"other"}'), null);
  assert.equal(parsePtyEvent('not json'), null);
});

test('status must come from an archon runner', () => {
  assert.ok(isRunnerInfo({ runner: 'archon', cwd: '/x', github: { connected: false, login: null } }));
  assert.ok(!isRunnerInfo({ runner: 'something-else', cwd: '/x', github: { connected: false } }));
  assert.ok(!isRunnerInfo(null));
});

test('the old localStorage token is taken out once', () => {
  const store = new Map([['archon_github_token', 'ghp_old']]);
  const storage = { getItem: k => store.get(k) ?? null, removeItem: k => store.delete(k) };
  assert.equal(takeLegacyToken(storage), 'ghp_old');
  assert.equal(store.has('archon_github_token'), false);
  assert.equal(takeLegacyToken(storage), '');
  assert.equal(takeLegacyToken({ getItem() { throw new Error('blocked'); }, removeItem() {} }), '');
});

const online = connected => ({ status: 'online', info: { runner: 'archon', cwd: '/', github: { connected, login: connected ? 'octocat' : null } } });

test('a session token wins over the runner, the runner over nothing', () => {
  assert.deepEqual(githubAuth('ghp_typed', online(true)), { token: 'ghp_typed', viaRunner: false });
  assert.deepEqual(githubAuth('', online(true)), { token: '', viaRunner: true });
  assert.deepEqual(githubAuth('', online(false)), { token: '', viaRunner: false });
  assert.deepEqual(githubAuth('', { status: 'offline' }), { token: '', viaRunner: false });
  assert.ok(!hasGitHubToken({ token: '', viaRunner: false }));
});

test('through the runner, requests carry no token', () => {
  const r = githubRequest('openRepo', 'http://localhost:8000', { token: '', viaRunner: true }, { body: { repo_url: 'a/b' } });
  assert.equal(r.url, 'http://127.0.0.1:7337/proxy/api/github/open-repo');
  assert.deepEqual(JSON.parse(r.init.body), { repo_url: 'a/b' });
  const f = githubRequest('file', 'http://localhost:8000', { token: '', viaRunner: true }, { query: { owner: 'a', path: 'x y.py' } });
  assert.equal(f.url, 'http://127.0.0.1:7337/proxy/api/github/file?owner=a&path=x+y.py');
  assert.equal(f.init.body, undefined);
});

test('direct requests put the session token where each endpoint expects it', () => {
  const auth = { token: 'ghp_t', viaRunner: false };
  assert.equal(JSON.parse(githubRequest('save', 'http://api/', auth, { body: {} }).init.body).token, 'ghp_t');
  assert.equal(JSON.parse(githubRequest('index', 'http://api', auth, { body: {} }).init.body).github_token, 'ghp_t');
  assert.equal(githubRequest('file', 'http://api', auth, { query: { path: 'a' } }).url, 'http://api/api/github/file?path=a&token=ghp_t');
  assert.equal(JSON.parse(githubRequest('fork', 'http://api', { token: '', viaRunner: false }, { body: { owner: 'o' } }).init.body).token, undefined);
});

test('every call is one the runner forwards', () => {
  assert.deepEqual(Object.values(GITHUB_CALLS).map(c => c.path).sort(), [
    'api/github/file', 'api/github/fork', 'api/github/open-repo', 'api/github/save', 'api/workspace/index-codebase',
  ]);
});
