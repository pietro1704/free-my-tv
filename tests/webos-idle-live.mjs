// Opt-in device integration checks: LG_TV_HOST=<local IP> node tests/webos-idle-live.mjs
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
  assert.equal(await evaluate('CONFIG.homeProfile.idleMinutes'), 0.25);
  await evaluate(`window.__idleLaunch = TV.launch; window.__idleCalls = [];
    TV.launch = function (id, params, done) {window.__idleCalls.push({id: id, params: params}); done(false)};
    document.dispatchEvent(new MouseEvent('mousemove'));`);
  await wait(17000);
  const calls = await evaluate('window.__idleCalls');
  assert.equal(calls.length, 1, 'Visible home must start its saver after 15 seconds');
  assert.equal(calls[0].id, 'com.webos.app.screensaver');
  assert.equal(calls[0].params.idleSource, 'freemytv');
  assert.ok(calls[0].params.idleElapsedMs >= 15000 && calls[0].params.idleElapsedMs < 20000);
  await wait(3000);
  assert.equal(await evaluate('window.__idleCalls.length'), 1, 'Failed launch must not retry every second');
  await evaluate("document.dispatchEvent(new MouseEvent('mousemove'))");
  await wait(3000);
  assert.equal(await evaluate('window.__idleCalls.length'), 1, 'Remote pointer activity must reset the idle clock');
  const hiddenCalls = await evaluate(`(function () {
    var descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    try {
      Object.defineProperty(document, 'hidden', {value: true, configurable: true});
      FreeMyTV.showSaver(); return window.__idleCalls.length;
    } finally {
      if (descriptor) Object.defineProperty(document, 'hidden', descriptor); else delete document.hidden;
    }
  })()`);
  assert.equal(hiddenCalls, 1, 'Background home must never interrupt another app');
  await evaluate(`window.__idleNativeOK = null;
    TV.launch = function (id, params, done) {window.__idleLaunch(id, params, function (ok) {window.__idleNativeOK = ok; done(ok)})};
    document.dispatchEvent(new MouseEvent('mousemove'));`);
  await wait(18000);
  assert.equal(await evaluate('window.__idleNativeOK'), true, 'TV must accept the real native screensaver launch');
  console.log('PASS: 15-second timer, exact native identity and elapsed time, failed-launch throttle, input cancellation, background guard and actual native launch');
} finally {
  await evaluate(`if (window.__idleLaunch) {TV.launch = window.__idleLaunch; delete window.__idleLaunch; delete window.__idleCalls; delete window.__idleNativeOK}`);
  socket.close();
}
