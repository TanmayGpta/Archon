import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, commandById, scoreCommand, searchCommands } from './commands.ts';

const titles = list => list.map(c => c.title);

test('command ids are unique and dotted', () => {
  const ids = COMMANDS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z]+\.[a-zA-Z]+$/);
});

test('the roadmap starter set is present', () => {
  for (const id of ['studio.ask', 'studio.ide', 'studio.evaluation', 'studio.architect', 'studio.conformance',
    'workspace.openFolder', 'conformance.run', 'architect.generate', 'terminal.toggle', 'chat.new', 'model.select']) {
    assert.ok(commandById(id), id);
  }
});

test('empty query lists everything in registry order', () => {
  assert.deepEqual(searchCommands('', COMMANDS), COMMANDS);
});

test('title prefix beats keyword and substring matches', () => {
  const r = titles(searchCommands('go to c', COMMANDS));
  assert.equal(r[0], 'Go to Conformance');
});

test('keywords find commands whose title does not contain the word', () => {
  assert.ok(titles(searchCommands('audit', COMMANDS)).includes('Run conformance check'));
  assert.equal(titles(searchCommands('ollama', COMMANDS))[0], 'Select model…');
});

test('letters in order match as a last resort', () => {
  assert.ok(scoreCommand('rcc', { title: 'Run conformance check', group: 'Conformance' }) > 0);
  assert.equal(scoreCommand('zzz', { title: 'Run conformance check', group: 'Conformance' }), null);
});

test('regex characters in the query are safe', () => {
  assert.doesNotThrow(() => searchCommands('(', COMMANDS));
  assert.doesNotThrow(() => searchCommands('a+[', COMMANDS));
});
