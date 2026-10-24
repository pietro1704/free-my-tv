// Opt-in device integration checks: LG_TV_HOST=<local IP> node tests/webos-widgets-live.mjs
import assert from 'node:assert/strict';
const host = process.env.LG_TV_HOST;
assert.ok(host, 'Set LG_TV_HOST to the TV on your LAN');
const pages = await (await fetch(`http://${host}:9998/json/list`)).json();
const page = pages.find(p => p.description === 'io.freemytv');
assert.ok(page, 'Open Free My TV first');
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map(); let sequence = 0;
socket.onmessage = e => {
  const data = JSON.parse(e.data), request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id); clearTimeout(request.timer);
  if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result);
};
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout')); }, 15000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  assert.equal(result.exceptionDetails, undefined, 'JavaScript error in the app');
  return result.result.value;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (let i = 0; i < 40; i++) {
    if (await evaluate("typeof FreeMyTV !== 'undefined' && document.querySelectorAll('#home-widgets button').length === 2")) break;
    await wait(250);
  }
  await evaluate(`window.__widgetsKeepAlive = setInterval(function () {document.dispatchEvent(new MouseEvent('mousemove'))}, 4000);
    document.dispatchEvent(new MouseEvent('mousemove'));
    window.__widgetsLab = TV.readHomelab; window.__widgetsBrew = TV.readBrewApps;
    window.__widgetsCalls = {lab: 0, brew: 0};
    TV.readHomelab = function (host, done) {window.__widgetsCalls.lab++; return window.__widgetsLab(host, done)};
    TV.readBrewApps = function (done) {window.__widgetsCalls.brew++; return window.__widgetsBrew(done)};`);
  const text = "Array.prototype.map.call(document.querySelectorAll('#home-widgets button'), function (node) {return node.textContent})";
  let widgets;
  for (let i = 0; i < 44; i++) {
    widgets = await evaluate(text);
    if (/CPU \d+%/.test(widgets[0]) && /atualizações disponíveis|repositório oficial/.test(widgets[1])) break;
    await wait(500);
  }
  assert.match(widgets[0], /CPU \d+%/);
  assert.match(widgets[0], /Docker \d+\/\d+/);
  assert.match(widgets[1], /atualizações disponíveis|repositório oficial/);
  const layout = await evaluate(`(function () {
    var nodes = document.querySelectorAll('#home-widgets button'), a = nodes[0].getBoundingClientRect(), b = nodes[1].getBoundingClientRect(), shelf = document.getElementById('platter').getBoundingClientRect();
    return {visible: getComputedStyle(nodes[0].parentNode).display !== 'none', separate: a.right < b.left, aboveShelf: a.bottom < shelf.top};
  })()`);
  assert.deepEqual(layout, {visible: true, separate: true, aboveShelf: true});
  const nav = await evaluate(`(function () {
    FreeMyTV.state.zone = 'shelf'; FreeMyTV.state.shelf = 0; FreeMyTV.move(0,-1);
    var first = FreeMyTV.state.zone === 'widgets'; FreeMyTV.move(1,0);
    var second = FreeMyTV.state.widget === 1; FreeMyTV.move(0,1);
    return {first: first, second: second, shelf: FreeMyTV.state.zone === 'shelf'};
  })()`);
  assert.deepEqual(nav, {first: true, second: true, shelf: true});
  await evaluate("document.querySelector('[data-widget=arch]').click()");
  assert.equal(await evaluate("FreeMyTV.state.zone === 'settings' && document.querySelector('#settings .row').textContent.indexOf(HomeProfile.labels.homelabStatus) === 0"), true);
  await evaluate('FreeMyTV.back();FreeMyTV.back()');
  const destination = await evaluate(`(function () {
    var old = TV.launch, opened;
    try {TV.launch = function (id, params, done) {opened = id; done(false)}; document.querySelector('[data-widget=webosbrew]').click(); return {id: opened, error: document.getElementById('toast').className.indexOf('on') >= 0};}
    finally {TV.launch = old;}
  })()`);
  assert.deepEqual(destination, {id: 'org.webosbrew.hbchannel', error: true});
  await evaluate(`window.__widgetsHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', {value: true, configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));`);
  const paused = await evaluate('window.__widgetsCalls');
  await wait(31000);
  assert.deepEqual(await evaluate('window.__widgetsCalls'), paused, 'Hidden widgets must not read the homelab or installed apps');
  await evaluate(`TV.readHomelab = function (host, done) {done(null); return function () {}};
    delete document.hidden; if (window.__widgetsHiddenDescriptor) Object.defineProperty(document, 'hidden', window.__widgetsHiddenDescriptor);
    document.dispatchEvent(new Event('visibilitychange'));`);
  assert.equal(await evaluate("document.querySelector('[data-widget=arch] .widget-status').textContent"), await evaluate('HomeProfile.labels.offline'));
  assert.equal(await evaluate("document.querySelector('[data-widget=arch] .widget-detail').textContent"), '—');
  console.log(JSON.stringify({pass:true, widgets, layout, nav, destination, hiddenCancellation:true, transportFailure:true}, null, 2));
} finally {
  await evaluate(`if (window.__widgetsLab) TV.readHomelab = window.__widgetsLab;
    if (window.__widgetsBrew) TV.readBrewApps = window.__widgetsBrew;
    if (window.__widgetsHiddenDescriptor) Object.defineProperty(document, 'hidden', window.__widgetsHiddenDescriptor); else delete document.hidden;
    clearInterval(window.__widgetsKeepAlive);
    document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new MouseEvent('mousemove'));
    delete window.__widgetsLab; delete window.__widgetsBrew; delete window.__widgetsCalls; delete window.__widgetsKeepAlive; delete window.__widgetsHiddenDescriptor;`);
  socket.close();
}
