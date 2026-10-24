// Build a private --preview first. CHROMIUM=<binary> node tests/dashboard-browser.mjs; no TV or external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const browser = process.env.CHROMIUM || '/Applications/Chromium.app/Contents/MacOS/Chromium';
const preview = path.resolve(process.env.DASHBOARD_PREVIEW || 'out/webos/index.html');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-dashboard-browser-'));
const child = spawn(browser, ['--headless', '--allow-file-access-from-files', '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], {stdio: 'ignore', detached: true});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, closeBrowser; const pending = new Map(); let id = 0;
const errors = [];
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let n = 0; n < 100 && !fs.existsSync(portFile); n++) await wait(100);
  assert.ok(fs.existsSync(portFile), 'Chromium did not start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    const request = pending.get(data.id); if (!request) return;
    pending.delete(data.id); clearTimeout(request.timer);
    data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result);
  };
  await new Promise((resolve, reject) => {ws.onopen = resolve; ws.onerror = reject;});
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const sequence = ++id, timer = setTimeout(() => {pending.delete(sequence); reject(new Error('CDP timeout'));}, 10000);
      pending.set(sequence, {timer, resolve, reject}); ws.send(JSON.stringify({id: sequence, method, params}));
    });
  }
  closeBrowser = () => call('Browser.close');
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    assert.equal(result.exceptionDetails, undefined, 'Dashboard threw a JavaScript exception'); return result.result.value;
  }
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Network.setBlockedURLs', {urls:['http://*', 'https://*']});
  await call('Emulation.setDeviceMetricsOverride', {width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await call('Page.addScriptToEvaluateOnNewDocument', {source:`
    if (${!!process.env.DASHBOARD_LEGACY}) {
      Object.defineProperty(window,'CONFIG',{configurable:true,get:function(){return window.__config;},set:function(value){if(value.homeProfile)value.homeProfile.dashboard=false;window.__config=value;}});
    }
    window.__launches=[]; window.__failLaunch=false;
    window.PalmServiceBridge=function(){
      this.cancel=function(){};
      this.call=function(uri,body){
        var self=this,p=JSON.parse(body),res={returnValue:true};
        if(uri.indexOf('getAppLoadStatus')>=0) res.exist=CONFIG.homeProfile.items.some(function(x){return x.id===p.appId});
        else if(uri.indexOf('getAllInputStatus')>=0) res.devices=[];
        else if(uri.indexOf('/launch')>=0){window.__launches.push(p.id);res.returnValue=!window.__failLaunch;}
        else if(uri.indexOf('/exec')>=0){
          res.stdoutString=p.command.indexOf('appinfo.json')>=0 ? JSON.stringify([{id:'org.webosbrew.hbchannel',title:'Homebrew',version:'0.7.3'}]) : '';
        }
        setTimeout(function(){self.onservicecallback(JSON.stringify(res));},0);
      };
    };`});
  await call('Page.navigate', {url:pathToFileURL(preview).href});
  for(let n=0;n<100;n++) {
    if(await evaluate("typeof FreeMyTV!=='undefined' && document.querySelectorAll('#tiles .tile').length===4")) break;
    await wait(100);
  }
  if(process.env.DASHBOARD_LEGACY) {
    assert.equal(await evaluate('TV.name'),'webos');
    assert.equal(await evaluate("document.querySelectorAll('#tabs .tab').length"),3);
    assert.equal(await evaluate("document.querySelectorAll('#home-widgets button').length"),2);
    await evaluate("FreeMyTV.state.zone='top';FreeMyTV.state.top=5;FreeMyTV.activate()");
    assert.equal(await evaluate("FreeMyTV.state.zone==='settings'"),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: legacy three-tab home, two widgets, diagnostics and chosen app discovery');
  } else {
  assert.deepEqual(await evaluate("Array.prototype.map.call(document.querySelectorAll('#tabs .tab'),function(x){return x.textContent})"),['YouTube','Notícias','Mídia','Infos']);
  assert.equal(await evaluate('TV.name'), 'webos', 'Browser must exercise the injected webOS bridge');
  const expected = await evaluate('CONFIG.homeProfile.items.map(function(x){return x.id})');
  const views = [['youtube','media','news'],['news'],['media','news'],[]];
  for(let tab=0;tab<4;tab++) {
    await evaluate(`document.querySelectorAll('#tabs .tab')[${tab}].click()`);
    assert.equal(await evaluate('FreeMyTV.state.tab'),tab);
    assert.deepEqual(await evaluate("Array.prototype.filter.call(document.querySelectorAll('#dashboard [data-panel]'),function(x){return getComputedStyle(x).display!=='none'}).map(function(x){return x.getAttribute('data-panel')})"),views[tab]);
    assert.deepEqual(await evaluate("Array.prototype.map.call(document.querySelectorAll('#tiles .tile'),function(x){return x.getAttribute('data-app-id')})"),expected);
  }
  await evaluate("document.querySelectorAll('#tabs .tab')[0].click()");
  const geometry=await evaluate(`(function(){var y=document.querySelector('[data-panel=youtube]').getBoundingClientRect(),m=document.querySelector('[data-panel=media]').getBoundingClientRect(),n=document.querySelector('[data-panel=news]').getBoundingClientRect(),w=document.getElementById('home-widgets').getBoundingClientRect(),s=document.getElementById('platter').getBoundingClientRect();return {ratio:y.width/m.width,newsBelow:n.top>y.bottom,widgetsBelow:w.top>n.bottom,shelfBelow:s.top>w.bottom}})()`);
  assert.deepEqual(geometry,{ratio:2,newsBelow:true,widgetsBelow:true,shelfBelow:true});
  assert.deepEqual(await evaluate("Array.prototype.map.call(document.querySelectorAll('#home-widgets button'),function(x){return x.getAttribute('data-widget')})"),['arch','weather','calendar','webosbrew']);
  const navigation=await evaluate(`(function(){FreeMyTV.state.zone='top';FreeMyTV.state.top=0;FreeMyTV.move(0,1);var order=[FreeMyTV.state.zone];FreeMyTV.move(1,0);order.push(HomeDashboard.items(0)[FreeMyTV.state.dashboard]);FreeMyTV.move(0,1);order.push(HomeDashboard.items(0)[FreeMyTV.state.dashboard]);FreeMyTV.move(0,1);order.push(FreeMyTV.state.zone);FreeMyTV.move(0,1);order.push(FreeMyTV.state.zone);return order})()`);
  assert.deepEqual(navigation,['dashboard','media','news','widgets','shelf']);
  await evaluate("document.querySelector('[data-panel=youtube]').click();document.querySelector('[data-panel=media]').click()");
  assert.deepEqual(await evaluate('window.__launches.slice(-2)'),['com.cobalt.youtube.adfree','space.nuvio.webos']);
  await evaluate("window.__failLaunch=true;document.querySelector('[data-panel=media]').click();window.__failLaunch=false");
  assert.equal(await evaluate("document.getElementById('toast').className.indexOf('on')>=0"),true);
  await evaluate("document.querySelectorAll('#tabs .tab')[3].click();FreeMyTV.move(1,0);FreeMyTV.activate()");
  assert.equal(await evaluate("FreeMyTV.state.zone==='settings'"),true,'Fourth tab must not consume the diagnostics button');
  await evaluate("FreeMyTV.back();FreeMyTV.back();document.querySelectorAll('#tabs .tab')[0].click()");
  assert.equal(await evaluate("document.querySelectorAll('#cards .card').length"),0);
  assert.equal(await evaluate('CONFIG.homeProfile.idleMinutes'),0.25);
  assert.deepEqual(errors,[]);
  const overflow = await evaluate("Array.prototype.some.call(document.querySelectorAll('#dashboard .dashboard-subtitle'),function(x){return x.clientWidth>0 && (x.scrollWidth>x.clientWidth || x.getBoundingClientRect().right>x.parentNode.getBoundingClientRect().right)})");
  assert.equal(overflow,false,'Panel subtitles must wrap within their card');
  if(process.env.DASHBOARD_SCREENSHOT){await evaluate("Prefs.set('theme','dark');Data.settingsChanged();document.getElementById('toast').className=''");await wait(2300);const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.DASHBOARD_SCREENSHOT,Buffer.from(shot.data,'base64'));}
  console.log(JSON.stringify({pass:true,tabs:4,fixedApps:expected,geometry,navigation,exactLaunches:true,launchFailure:true,diagnostics:true,unconnectedFeedsExplicit:true,oledPolicyPreserved:true}));
  }
} finally {
  // Let Chrome flush and stop its helpers before deleting their profile, including on Linux CI.
  if(closeBrowser) {try {await Promise.race([closeBrowser(),wait(2000)]);} catch(error) {}}
  if(ws) ws.close(); for(const request of pending.values())clearTimeout(request.timer);
  if(child.exitCode===null) await Promise.race([new Promise(resolve=>child.once('exit',resolve)),wait(5000)]);
  try {process.kill(-child.pid,'SIGTERM');} catch(error) {if(error.code!=='ESRCH')throw error;}
  if(child.exitCode===null) await Promise.race([new Promise(resolve=>child.once('exit',resolve)),wait(2000)]);
  try {process.kill(-child.pid,'SIGKILL');} catch(error) {if(error.code!=='ESRCH')throw error;}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
