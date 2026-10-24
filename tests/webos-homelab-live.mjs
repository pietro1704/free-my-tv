// LG_TV_HOST=<LAN IP> node tests/webos-homelab-live.mjs; requires the optional local homelab profile.
import assert from 'node:assert/strict';
const host = process.env.LG_TV_HOST;
assert.ok(host, 'Set LG_TV_HOST');
const pages = await (await fetch(`http://${host}:9998/json/list`)).json();
const page = pages.find(p => p.description === 'io.freemytv');
assert.ok(page, 'Open Free My TV');
const ws = new WebSocket(page.webSocketDebuggerUrl), pending = new Map(); let id = 0;
ws.onmessage = event => {
  const data = JSON.parse(event.data), request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id); clearTimeout(request.timer);
  data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result);
};
await new Promise((resolve, reject) => {ws.onopen = resolve; ws.onerror = reject});
function evaluate(expression) {
  return new Promise((resolve, reject) => {
    const sequence = ++id;
    const timer = setTimeout(() => {pending.delete(sequence); reject(new Error('CDP timeout'))}, 10000);
    pending.set(sequence, {timer, reject, resolve(result) {
      if (result.exceptionDetails) reject(new Error(result.exceptionDetails.text)); else resolve(result.result.value);
    }});
    ws.send(JSON.stringify({id: sequence, method: 'Runtime.evaluate', params: {expression, returnByValue: true}}));
  });
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const open = `(function () {
  FreeMyTV.state.zone = 'top'; FreeMyTV.state.top = 5; FreeMyTV.activate();
  var rows = document.querySelectorAll('#settings .row');
  for (var i = 0; i < rows.length; i++) if (rows[i].textContent.indexOf(HomeProfile.labels.homelab) === 0) {rows[i].click(); return true}
  return false;
})()`;
const rows = `Array.prototype.map.call(document.querySelectorAll('#settings .row'), function (r) {return r.textContent})`;
try {
  for (let i = 0; i < 40; i++) {
    if (await evaluate("typeof FreeMyTV !== 'undefined' && !document.hidden")) break;
    await wait(250);
  }
  await evaluate(`window.__labOriginal = TV.readHomelab;
    window.__labCalls = 0; window.__labOffline = true;
    TV.readHomelab = function (host, done) {
      window.__labCalls++;
      if (window.__labOffline) {done(null); return function () {}}
      return window.__labOriginal.call(TV, host, done);
    };`);
  assert.equal(await evaluate(open), true);
  await wait(100);
  assert.equal(await evaluate(`document.querySelector('#settings .row').textContent.indexOf(HomeProfile.labels.offline) >= 0`), true);
  assert.equal(await evaluate(`document.querySelectorAll('#settings .row')[3].textContent.indexOf('—') >= 0`), true);
  await evaluate('FreeMyTV.back();window.__labOffline = false;window.__labCalls = 0');
  console.log('PASS: falha de transporte aparece como indisponível, sem métricas inventadas.');
  assert.equal(await evaluate(open), true);
  let observed;
  for (let i = 0; i < 60; i++) {
    observed = await evaluate(rows);
    if (observed[1]?.includes('%') && observed[5] && !observed[5].includes('—')) break;
    await wait(500);
  }
  assert.ok(observed[1].includes('%'), 'CPU must be measured across two samples');
  assert.ok(!observed[3].includes('—'), 'Host RAM must be present');
  assert.ok(!observed[5].includes('—'), 'Docker counts must be present');
  assert.ok(observed[6].includes('°C'), 'CPU sensor must be present');
  const count = await evaluate('window.__labCalls');
  assert.equal(count, 2, 'The spy must observe the actual initial and warmup reads');
  console.log(JSON.stringify({liveHomelab: observed, requests: count}, null, 2));
  await evaluate('FreeMyTV.back()');
  await wait(31000);
  assert.equal(await evaluate('window.__labCalls'), count, 'No polling after closing');
  console.log('PASS: nenhuma consulta em segundo plano após fechar durante um período completo de 30s.');
} finally {
  await evaluate(`if (window.__labOriginal) {TV.readHomelab = window.__labOriginal; delete window.__labOriginal}
    for (var i = 0; i < 3 && FreeMyTV.state.zone === 'settings'; i++) FreeMyTV.back();
    delete window.__labCalls; delete window.__labOffline;`);
  ws.close();
}
