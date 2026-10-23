const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {}; vm.createContext(context); vm.runInContext(fs.readFileSync('web/idle.js', 'utf8'), context);
const p = context.IdlePolicy;
test('short idle timer runs in visible panels but never while another app is playing', () => {
  assert.equal(p.saverDelay(0.25), 15000);
  assert.equal(p.saverDelay(0.01), 15000);
  assert.equal(p.saverDelay(undefined), 300000);
  assert.equal(p.due(16000, 0, false, 0, 15000), true);
  assert.equal(p.due(16000, 0, true, 0, 15000), false);
  assert.equal(p.due(16000, 15000, false, 0, 15000), false);
  assert.equal(p.due(16000, 0, false, 30000, 15000), false);
});
test('standby budget counts the idle time before the screensaver, including zero', () => {
  const args = value => [JSON.stringify({parameters: value})];
  assert.equal(p.elapsedFromArgs(args({idleSource: 'freemytv', idleElapsedMs: 0}), 180000), 0);
  assert.equal(p.elapsedFromArgs(args({idleSource: 'freemytv', idleElapsedMs: 15000}), 180000), 15000);
  assert.equal(p.remaining(15000, 1800000), 1785000);
  assert.equal(p.remaining(180000, 1800000), 1620000);
  assert.equal(p.remaining(1800001, 1800000), 1000);
});
test('invalid and unrelated launch identities cannot change the idle clock', () => {
  for (const value of [{idleSource:'other',idleElapsedMs:1000},{idleSource:'freemytv',idleElapsedMs:-1},{idleSource:'freemytv',idleElapsedMs:null}]) {
    assert.equal(p.elapsedFromArgs([JSON.stringify({parameters:value})],180000),180000);
  }
  assert.equal(p.elapsedFromArgs(['not json'],180000),180000);
});
