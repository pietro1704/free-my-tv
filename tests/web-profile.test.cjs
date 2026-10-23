const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const cp = require('node:child_process');

function load(name, config) {
  const context = {window: {CONFIG: config || {}}};
  vm.createContext(context);
  const source = process.env.SOURCE_REF
    ? cp.execFileSync('git', ['show', process.env.SOURCE_REF + ':web/' + name], {encoding: 'utf8'})
    : fs.readFileSync('web/' + name, 'utf8');
  vm.runInContext(source, context);
  return context;
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
const snapshot = 'cpu 100 0 100 800 0 0 0 0 99 99\nMemTotal: 2048000 kB\nMemAvailable: 512000 kB\n mode: "1920x1080": 60 148500\ndispFramerate : 3 (0:60,1:120,3:144)';

test('forecast uses today and tomorrow min/max and rain probability, including zero', () => {
  const f = load('forecast.js').Forecast;
  const daily = {time: ['2026-01-01', '2026-01-02', '2026-01-03'],
    temperature_2m_min: [20, 21, 22], temperature_2m_max: [24, 26, 28], precipitation_probability_max: [0, 80, 90]};
  assert.deepEqual(plain(f.days(daily)), [
    {date: '2026-01-01', min: 20, max: 24, rain: 0}, {date: '2026-01-02', min: 21, max: 26, rain: 80}]);
  assert.deepEqual(plain(f.days(null)), []);
  assert.equal(f.days({time: ['date'], precipitation_probability_max: [101]})[0].rain, null);
  assert.equal(f.days({time: ['date'], temperature_2m_min: [null]})[0].min, null);
});

test('forex uses real USD and EUR pairs and rejects partial or malformed responses', () => {
  const f = load('forex.js').Forex;
  const body = {USDBRL: {bid: '5', pctChange: '0'}, EURBRL: {bid: '6', pctChange: '20'}, BTCBRL: {bid: '400000', pctChange: '-20'}};
  const quotes = plain(f.quotes(body, ['BTC', 'USD', 'EUR']));
  assert.deepEqual(quotes.map(q => q.symbol), ['BTCBRL', 'USDBRL', 'EURBRL']);
  assert.equal(quotes[1].lastPrice, 5);
  assert.equal(quotes[2].openPrice, 5);
  assert.equal(f.quotes({USDBRL: body.USDBRL}, ['USD', 'EUR']), null);
  assert.equal(f.quotes({USDBRL: {bid: 'NaN', pctChange: '0'}}, ['USD']), null);
  assert.equal(f.quotes({USDBRL: {bid: '5', pctChange: '-100'}}, ['USD']), null);
  assert.equal(f.quotes({USDBRL: {bid: '5', pctChange: null}}, ['USD']), null);
});

test('profile uses exact IDs, includes chosen HDMI, preserves order and does not mutate apps', () => {
  const p = load('profile.js', {homeProfile: {items: [
    {id: 'youtube.adfree', title: 'YouTube', icon: 'data:image/png;base64,test'},
    {id: 'nuvio'}, {id: 'hdmi2', title: 'Receiver'}, {id: 'hdmi3', title: 'PS5'}, {id: 'nuvio'}
  ], catalogApp: 'nuvio'}}).HomeProfile;
  const apps = [{id: 'youtube', title: 'Stock'}, {id: 'youtube.adfree', title: 'AdFree'}, {id: 'nuvio', title: 'Nuvio'}, {id: 'homebrew'}];
  const inputs = [{id: 'hdmi1'}, {id: 'hdmi2'}, {id: 'hdmi3'}, {id: 'hdmi4'}];
  const before = JSON.stringify(apps);
  const shelf = plain(p.shelf(apps, inputs));
  assert.deepEqual(shelf.map(x => x.id), ['youtube.adfree', 'nuvio', 'hdmi2', 'hdmi3']);
  assert.equal(shelf[0].icon, 'data:image/png;base64,test');
  assert.equal(shelf[2].title, 'Receiver');
  assert.deepEqual(plain(p.inputs(inputs)).map(x => x.id), ['hdmi2', 'hdmi3']);
  assert.equal(p.catalogApp(apps).id, 'nuvio');
  assert.equal(JSON.stringify(apps), before);
});

test('missing app never selects a similarly named app and no profile preserves all inputs', () => {
  const p = load('profile.js', {homeProfile: {items: [{id: 'youtube.adfree'}], catalogApp: 'nuvio'}}).HomeProfile;
  assert.deepEqual(plain(p.shelf([{id: 'youtube', title: 'AdFree'}], [])), []);
  assert.equal(p.catalogApp([]), null);
  const defaults = load('profile.js').HomeProfile, inputs = [{id: 'hdmi1'}];
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.inputs(inputs), inputs);
});

test('webOS discovery keeps exact custom apps when its paired app-list connection fails', () => {
  const config = {homeProfile: {items: [{id: 'custom.youtube.adfree', title: 'YouTube'}, {id: 'custom.player', title: 'Player'}]}};
  const context = {window: {CONFIG: config}, localStorage: {getItem() {return 'paired-key'}},
    setTimeout() {return 1}, clearTimeout() {},
    WebSocket: function () {throw new Error('connection unavailable')}};
  const checked = [];
  context.window.PalmServiceBridge = function () {
    this.call = (uri, payload) => {
      const request = JSON.parse(payload);
      if (uri.endsWith('/listLaunchPoints')) this.onservicecallback('{"returnValue":false}');
      else {
        checked.push(request.appId);
        this.onservicecallback(JSON.stringify({returnValue: true, exist: ['custom.youtube.adfree', 'custom.player', 'youtube.leanback.v4'].includes(request.appId)}));
      }
    };
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('web/tv.js', 'utf8'), context);
  let apps;
  context.TV.apps(result => {apps = result});
  assert.ok(checked.includes('custom.youtube.adfree'));
  assert.ok(checked.includes('custom.player'));
  assert.ok(apps.some(app => app.id === 'custom.youtube.adfree'));
  assert.ok(apps.some(app => app.id === 'custom.player'));
});

test('CPU excludes guest double counting, RAM uses available, panel and compositor are distinct', () => {
  const d = load('diagnostics.js').Diagnostics;
  const s = d.parse(snapshot);
  assert.equal(s.totalMB, 2000);
  assert.equal(s.usedMB, 1500);
  assert.equal(s.panelHz, 144);
  assert.equal(s.compositorHz, 60);
  assert.equal(d.percent(s.cpu, d.parse(snapshot.replace('100 0 100 800', '150 0 100 850')).cpu), 50);
  assert.equal(d.percent(s.cpu, s.cpu), null);
  assert.equal(d.percent(s.cpu, [0, 0, 0, 0, 0, 0, 0, 0]), null);
});

test('unavailable, malformed and partial stats remain unavailable', () => {
  const d = load('diagnostics.js').Diagnostics;
  assert.equal(d.parse('').usedMB, null);
  assert.equal(d.parse('cpu 1 bad 2 3 4 5 6 7').cpu, null);
  assert.equal(d.parse('MemTotal: 1000\nMemAvailable: 2000').usedMB, null);
  assert.equal(d.parse('dispFramerate : 99').panelHz, null);
  assert.equal(d.parse('mode: "none": not-a-rate').compositorHz, null);
});

function harness() {
  const tasks = new Map(); let id = 0;
  const timers = {setTimeout(fn, delay) { tasks.set(++id, {fn, delay}); return id; }, clearTimeout(n) { tasks.delete(n); }};
  const requests = []; let cancelled = 0;
  const read = done => { requests.push(done); return () => cancelled++; };
  const d = load('diagnostics.js').Diagnostics, output = [];
  const monitor = d.monitor(read, timers);
  const fire = delay => { const entry = [...tasks.entries()].find(([, x]) => x.delay === delay); assert.ok(entry); tasks.delete(entry[0]); entry[1].fn(); };
  return {tasks, requests, output, monitor, fire, cancelled: () => cancelled};
}

test('monitor samples CPU over time, cancels on close and ignores callbacks from a previous opening', () => {
  const h = harness();
  h.monitor.start(s => h.output.push(s));
  h.requests[0](snapshot);
  assert.equal(h.output[0].cpuPercent, null);
  h.fire(5000);
  h.requests[1](snapshot.replace('100 0 100 800', '150 0 100 850'));
  assert.equal(h.output[1].cpuPercent, 50);
  h.fire(5000);
  h.monitor.stop();
  assert.equal(h.tasks.size, 0);
  const old = h.requests[2];
  h.monitor.start(s => h.output.push(s));
  old(snapshot);
  assert.equal(h.output.length, 2);
  h.requests[3](snapshot);
  assert.equal(h.output[2].cpuPercent, null);
  h.monitor.stop();
  assert.equal(h.tasks.size, 0);
});

test('monitor times out, reports unavailable, ignores late results and can be cancelled from callback', () => {
  const h = harness();
  h.monitor.start(s => h.output.push(s));
  h.fire(4000);
  assert.equal(h.output[0].totalMB, null);
  assert.equal(h.cancelled(), 1);
  h.requests[0](snapshot);
  assert.equal(h.output.length, 1);
  h.monitor.stop();
  h.monitor.start(() => h.monitor.stop());
  h.requests[1](snapshot);
  assert.equal(h.tasks.size, 0);
});

test('a denied bridge reports unavailable without breaking the sheet', () => {
  const d = load('diagnostics.js').Diagnostics;
  const tasks = new Map(); let id = 0, result;
  const timers = {setTimeout(fn) {tasks.set(++id, fn); return id}, clearTimeout(i) {tasks.delete(i)}};
  const m = d.monitor(() => {throw new Error('permission denied')}, timers);
  m.start(s => {result = s});
  assert.equal(result.totalMB, null);
  m.stop();
  assert.equal(tasks.size, 0);
});
