const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const vm = require('node:vm');
const test = require('node:test');

function context() {
  const c = {window: {}};
  vm.createContext(c);
  for (const file of ['diagnostics.js', 'homelab.js']) vm.runInContext(fs.readFileSync('web/' + file, 'utf8'), c);
  return c;
}
const agent = `<<<check_mk>>>
Version: test
<<<mem>>>
MemTotal: 8388608 kB
MemAvailable: 4194304 kB
<<<cpu>>>
0.75 0.50 0.25 1/200 100 4
<<<uptime>>>
90061.50 1234.00
<<<kernel>>>
cpu 100 0 100 800 0 0 0 0 0 0
<<<docker_node_info:sep(124)>>>
{"Containers":29,"ContainersRunning":7,"ContainersStopped":22,"PrivateRegistry":"must-not-leak"}
<<<docker_container_labels:sep(124)>>>
secret-label=must-not-leak
<<<lnx_thermal:sep(124)>>>
thermal_zone0|enabled|x86_pkg_temp|49000|60000|passive
<<<ps>>>
private-process-arguments=must-not-leak
`;

test('agent command permits exact IPv4 hosts and rejects shell or ambiguous host input', () => {
  const h = context().Homelab;
  assert.ok(h.command('192.168.1.2').startsWith('timeout 6 nc 192.168.1.2 6556 | awk '));
  for (const host of ['1.2.3.999', '1.2.3.04', 'host;id', '1.2.3.4\ncommand', '$(id)', '', null]) assert.equal(h.command(host), null);
});

test('agent filter keeps numeric host metrics and excludes process arguments, registry data and container labels', () => {
  const h = context().Homelab, command = h.command('127.0.0.1');
  const awk = command.slice(command.indexOf(' | awk ') + 7);
  const filtered = cp.execFileSync('/bin/sh', ['-c', 'awk ' + awk], {input: agent, encoding: 'utf8'});
  assert.ok(!filtered.includes('must-not-leak'));
  const stats = h.parse(filtered);
  assert.equal(stats.available, true);
  assert.equal(stats.totalMB, 8192);
  assert.equal(stats.usedMB, 4096);
  assert.equal(stats.load1, 0.75);
  assert.equal(stats.uptimeSeconds, 90061.5);
  assert.equal(stats.temperature, 49);
  assert.equal(stats.dockerRunning, 7);
  assert.equal(stats.dockerTotal, 29);
  assert.equal(stats.cpu.length, 8);
});

test('unreachable and partial agents stay unavailable without inventing zero metrics', () => {
  const h = context().Homelab;
  const empty = h.parse('');
  assert.equal(empty.available, false);
  assert.equal(empty.dockerRunning, null);
  assert.equal(empty.usedMB, null);
  assert.equal(h.parse('<<<uptime>>>\n1.0 2.0\n').available, false);
  assert.equal(h.parse('Containers=2\nContainersRunning=3').dockerRunning, null);
  assert.equal(h.parse('<<<lnx_thermal:sep(124)>>>\nzone|enabled|x86_pkg_temp|900000|').temperature, null);
});

test('homelab gets one warmup sample then polls slowly, and closing cancels queued or late work', () => {
  const c = context(), tasks = new Map(), callbacks = []; let sequence = 0, cancelled = 0;
  const timers = {setTimeout(fn, delay) {tasks.set(++sequence, {fn, delay}); return sequence}, clearTimeout(id) {tasks.delete(id)}};
  const read = done => {callbacks.push(done); return () => cancelled++};
  const result = [];
  const monitor = c.Diagnostics.monitor(read, timers, {parse: c.Homelab.parse, every: 30000, warmup: 1500, timeout: 8000});
  monitor.start(stats => result.push(stats));
  callbacks[0](agent);
  let next = [...tasks.entries()].find(([, value]) => value.delay === 1500);
  assert.ok(next); tasks.delete(next[0]); next[1].fn();
  callbacks[1](agent.replace('cpu 100 0 100 800', 'cpu 150 0 100 850'));
  assert.equal(result[1].cpuPercent, 50);
  assert.ok([...tasks.values()].some(value => value.delay === 30000));
  monitor.stop();
  assert.equal(tasks.size, 0);
  callbacks[1](agent);
  assert.equal(result.length, 2);
});
