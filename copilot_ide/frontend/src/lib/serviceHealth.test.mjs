import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceRows, healthLevel } from './serviceHealth.ts';

const orchestratorUp = (services = {}) => ({
  ok: true,
  ms: 12,
  body: { status: 'healthy', services: { orchestrator: true, rag_service: true, ingestion_service: true, ollama_gpu: true, ...services } },
});
const evalUp = { ok: true, ms: 30, body: { status: 'healthy' } };
const byId = rows => Object.fromEntries(rows.map(r => [r.id, r]));

test('before any reply everything is unknown and the level is checking', () => {
  const rows = serviceRows(null, null);
  assert.ok(rows.every(r => r.state === 'unknown'));
  assert.equal(healthLevel(rows).level, 'checking');
});

test('all up reads green with latency on the directly probed services', () => {
  const rows = byId(serviceRows(orchestratorUp(), evalUp));
  assert.equal(rows.orchestrator.latencyMs, 12);
  assert.equal(rows.evaluation.latencyMs, 30);
  assert.equal(rows.rag.latencyMs, undefined);
  assert.deepEqual(healthLevel(Object.values(rows)), { level: 'ok', label: 'All services up' });
});

test('services reported down by the orchestrator make it amber', () => {
  const rows = serviceRows(orchestratorUp({ rag_service: false, ollama_gpu: false }), evalUp);
  assert.equal(byId(rows).rag.state, 'down');
  assert.deepEqual(healthLevel(rows), { level: 'degraded', label: '2 services down' });
});

test('evaluation down alone is one service down', () => {
  const rows = serviceRows(orchestratorUp(), { ok: false });
  assert.deepEqual(healthLevel(rows), { level: 'degraded', label: '1 service down' });
});

test('orchestrator down is red and the services behind it become unknown', () => {
  const rows = byId(serviceRows({ ok: false }, evalUp));
  assert.equal(rows.orchestrator.state, 'down');
  assert.equal(rows.arcgen.state, 'down');
  assert.equal(rows.rag.state, 'unknown');
  assert.match(rows.rag.note, /orchestrator/);
  assert.deepEqual(healthLevel(Object.values(rows)), { level: 'down', label: 'Backend offline' });
});

test('a version in the health body is shown', () => {
  const rows = byId(serviceRows(orchestratorUp(), { ok: true, ms: 5, body: { version: '1.0.0' } }));
  assert.equal(rows.evaluation.version, '1.0.0');
});
