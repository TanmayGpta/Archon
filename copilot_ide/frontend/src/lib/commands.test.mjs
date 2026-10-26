import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, commandById, scoreCommand, searchCommands, matchesKeys, formatKeys } from './commands.ts';

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

const ev = (key, mods = {}, code = '') => ({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test('bindings match exactly, with Mod as Ctrl or Cmd', () => {
  assert.ok(matchesKeys(ev('p', { ctrlKey: true }), 'Mod+P'));
  assert.ok(!matchesKeys(ev('p', { ctrlKey: true, shiftKey: true }), 'Mod+P'), 'extra Shift');
  assert.ok(!matchesKeys(ev('p'), 'Mod+P'), 'no modifier');
  assert.ok(matchesKeys(ev('p', { metaKey: true }), 'Mod+P', true), 'Cmd on a Mac');
  assert.ok(!matchesKeys(ev('p', { ctrlKey: true }), 'Mod+P', true), 'Ctrl is not Mod on a Mac');
});

test('Alt bindings match by key code when Alt changes the character', () => {
  assert.ok(matchesKeys(ev('∑', { altKey: true }, 'KeyW'), 'Alt+W', true));
  assert.ok(matchesKeys(ev('`', { ctrlKey: true }, 'Backquote'), 'Mod+`'));
});

test('bindings format per platform', () => {
  assert.equal(formatKeys('Mod+P'), 'Ctrl+P');
  assert.equal(formatKeys('Mod+P', true), '⌘P');
  assert.equal(formatKeys('Alt+W', true), '⌥W');
});

test('every binding is unique', () => {
  const keys = COMMANDS.filter(c => c.keys).map(c => c.keys);
  assert.equal(new Set(keys).size, keys.length);
});
