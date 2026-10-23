// Opt-in device integration checks: LG_TV_HOST=<local IP> node tests/webos-live.mjs
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
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await evaluate("typeof FreeMyTV !== 'undefined' && document.querySelectorAll('#tiles .tile').length > 0");
    if (ready) break;
    await wait(250);
  }
  assert.ok(ready, 'App did not finish loading');
  for (let i = 0; i < 40; i++) {
    const loaded = await evaluate("Data.weather && Data.weather.days && Data.weather.days.length === 2 && Data.activeCoins().every(function (i) {return Data.prices[i] > 0})");
    if (loaded) break;
    await wait(250);
  }
  const shelf = await evaluate(`(function () {
    return {expected: CONFIG.homeProfile.items.map(function (x) {return x.id}),
      actual: Array.prototype.map.call(document.querySelectorAll('#tiles .tile'), function (tile) {
        var icon = tile.querySelector('img');
        return {id: tile.getAttribute('data-app-id'), icon: !!icon && icon.complete && icon.naturalWidth > 0};
      })};
  })()`);
  assert.deepEqual(shelf.actual.map(x => x.id), shelf.expected);
  assert.ok(shelf.actual.every(x => x.icon), 'Every chosen icon must load locally');
  const forecast = await evaluate(`({days: Array.prototype.map.call(document.querySelectorAll('.forecast-day'), function (e) {return e.textContent}), rain: Array.prototype.map.call(document.querySelectorAll('.forecast-rain'), function (e) {return e.textContent}), symbols: Data.activeCoins().map(function (i) {return Data.COINS[i]}), prices: Data.activeCoins().map(function (i) {return Data.prices[i]})})`);
  assert.deepEqual(forecast.days, ['Hoje', 'Amanhã']);
  assert.equal(forecast.rain.length, 2);
  assert.ok(forecast.rain.every(x => /\d+%/.test(x)), 'Both daily rain probabilities must load');
  assert.deepEqual(forecast.symbols, ['BTC', 'USD', 'EUR']);
  assert.ok(forecast.prices.every(x => x > 0), 'Actual BTC/USD/EUR quotes must load');
  const launch = await evaluate(`(function () {
    var old = TV.launch, ids = [], failed;
    try {
      TV.launch = function (id, params, done) {ids.push(id); done(true)};
      FreeMyTV.state.zone = 'shelf';
      for (var i = 0; i < CONFIG.homeProfile.items.length; i++) {FreeMyTV.state.shelf = i; FreeMyTV.activate()}
      TV.launch = function (id, params, done) {done(false)};
      FreeMyTV.state.shelf = 0; FreeMyTV.activate();
      failed = document.getElementById('toast').className.indexOf('on') >= 0;
    } finally {TV.launch = old}
    return {ids: ids, failureShown: failed};
  })()`);
  assert.deepEqual(launch.ids, shelf.expected);
  assert.equal(launch.failureShown, true);
  const hidden = await evaluate(`(function () {
    var descriptor = Object.getOwnPropertyDescriptor(document, 'hidden'), old = TV.launch, count = 0;
    try {
      Object.defineProperty(document, 'hidden', {value: true, configurable: true});
      TV.launch = function () {count++}; FreeMyTV.hideSaver(); FreeMyTV.showSaver();
      return {launches: count, saver: document.getElementById('saver').className.indexOf('on') >= 0};
    } finally {
      TV.launch = old;
      if (descriptor) Object.defineProperty(document, 'hidden', descriptor); else delete document.hidden;
    }
  })()`);
  assert.deepEqual(hidden, {launches: 0, saver: false}, 'Background app must never interrupt playback');
  await evaluate(`window.__liveCalls = 0; window.__livePalmCall = PalmServiceBridge.prototype.call;
    PalmServiceBridge.prototype.call = function (uri, payload) {
      if (uri.indexOf('hbchannel.service/exec') >= 0 && payload.indexOf('MemTotal') >= 0) window.__liveCalls++;
      return window.__livePalmCall.call(this, uri, payload);
    };
    document.querySelectorAll('#buttons .round')[0].click();`);
  await wait(6500);
  const diagnostics = await evaluate(`({rows: Array.prototype.map.call(document.querySelectorAll('#settings .row'), function (r) {return r.textContent}), calls: window.__liveCalls})`);
  assert.ok(diagnostics.rows[0].indexOf('%') >= 0, 'CPU percentage must be measured over two samples');
  assert.ok(!diagnostics.rows[1].includes('—'), 'RAM must come from the TV');
  assert.ok(diagnostics.rows[2].includes('Hz'), 'Panel mode must come from the driver');
  assert.ok(diagnostics.rows[3].includes('Hz'), 'Compositor must be separate from panel mode');
  assert.ok(diagnostics.rows[4].includes('FPS'), 'UI FPS must be measured');
  assert.ok(diagnostics.calls <= 2, 'Do not poll excessively');
  await evaluate('FreeMyTV.back()');
  await wait(5500);
  assert.equal(await evaluate('window.__liveCalls'), diagnostics.calls, 'Closing the sheet must stop sampling');
  await evaluate('FreeMyTV.back()');
  const frames = await evaluate(`new Promise(function (resolve) {
    var times = [], previous = null;
    function frame(at) {
      if (previous !== null) times.push(at - previous); previous = at;
      if (times.length < 180) {requestAnimationFrame(frame); return}
      var sum = 0; for (var i = 0; i < times.length; i++) sum += times[i];
      times.sort(function (a, b) {return a - b});
      resolve({fps: 1000 * times.length / sum, p95ms: times[Math.floor(times.length * 0.95)]});
    }
    requestAnimationFrame(frame);
  })`);
  console.log(JSON.stringify({pass: true, icons: shelf.actual.length, launchIdentity: true, launchFailure: true,
    backgroundSafe: true, cancellation: true, forecast, diagnostics: diagnostics.rows, frames}, null, 2));
} finally {
  await evaluate(`if (window.__livePalmCall) {PalmServiceBridge.prototype.call = window.__livePalmCall; delete window.__livePalmCall; delete window.__liveCalls}`);
  socket.close();
}
