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
  await call('Emulation.setTimezoneOverride',{timezoneId:'America/Sao_Paulo'});
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Network.setBlockedURLs', {urls:['http://*', 'https://*']});
  await call('Emulation.setDeviceMetricsOverride', {width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await call('Page.addScriptToEvaluateOnNewDocument', {source:`
    Object.defineProperty(window,'CONFIG',{configurable:true,get:function(){return window.__config;},set:function(value){
      var profile=value.homeProfile,feed=profile&&profile.calendarFeed;
      if (${!!process.env.DASHBOARD_LEGACY} && profile) profile.dashboard=false;
      if(feed){
        function key(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
        var today=new Date(),tomorrow=new Date();tomorrow.setDate(today.getDate()+1);
        feed.today=key(today);feed.tomorrow=key(tomorrow);feed.generatedAt=new Date().toISOString();
        feed.events.forEach(function(event,i){var start=new Date(i?tomorrow:today);start.setHours(16,0,0,0);event.start=start.toISOString();event.end=new Date(start.getTime()+3600000).toISOString()});
      }
      if(profile&&profile.newsFeed){profile.newsFeed.observedAt=new Date().toISOString();profile.newsFeed.items.forEach(function(item){item.analyzedAt=new Date().toISOString();if(item.publishedAt)item.publishedAt=new Date(Date.now()-3600000).toISOString()});}
      window.__config=value;
    }});
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
  assert.equal(await evaluate("document.querySelectorAll('.media-card').length"),3,'Nuvio snapshot must render image cards');
  assert.equal(await evaluate("document.querySelectorAll('.media-card img').length"),3);
  assert.equal(await evaluate("document.querySelector('.dashboard-media .dashboard-title').getBoundingClientRect().bottom <= document.querySelector('.media-viewport').getBoundingClientRect().top"),true,'Nuvio heading must stay above its artwork');
  await wait(500);
  assert.equal(await evaluate("document.querySelectorAll('.media-card img.failed').length"),2,'Blocked images must keep title fallback');
  assert.equal(await evaluate("document.querySelectorAll('.media-card img[src]').length"),2,'Only visible artwork and one next card may load');
  assert.equal(await evaluate("document.querySelectorAll('.media-card .media-name img').length"),0,'Titles must never become HTML');
  const carousel=await evaluate(`(function(){
    document.querySelectorAll('#tabs .tab')[0].click();FreeMyTV.state.zone='dashboard';FreeMyTV.state.dashboard=1;FreeMyTV.state.media=0;
    FreeMyTV.move(1,0);var selected=FreeMyTV.state.media;FreeMyTV.move(0,1);var below=HomeDashboard.items(0)[FreeMyTV.state.dashboard];
    var before=window.__launches.length;document.querySelectorAll('.media-card')[2].click();
    return {selected:selected,below:below,launches:window.__launches.length-before,last:window.__launches[window.__launches.length-1]};
  })()`);
  assert.deepEqual(carousel,{selected:1,below:'news',launches:1,last:'space.nuvio.webos'});
  const hiddenMedia=await evaluate(`(function(){document.querySelectorAll('#tabs .tab')[1].click();var before=window.__launches.length;document.querySelector('.media-card').click();document.querySelectorAll('#tabs .tab')[0].click();return window.__launches.length-before})()`);
  assert.equal(hiddenMedia,0,'Hidden artwork cannot launch Nuvio');
  const disconnected=await evaluate(`(function(){var feed=CONFIG.homeProfile.mediaFeed;try{CONFIG.homeProfile.mediaFeed=null;document.querySelectorAll('#tabs .tab')[2].click();return document.querySelectorAll('.media-card').length}finally{CONFIG.homeProfile.mediaFeed=feed;document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.equal(disconnected,0,'Disconnected feed cannot retain stale artwork');

  assert.equal(await evaluate("document.querySelector('[data-widget=calendar]').textContent.indexOf('Agenda fixture')>=0"),true,'Calendar must show personal snapshot titles');
  await evaluate("FreeMyTV.state.zone='widgets';FreeMyTV.state.widget=2;FreeMyTV.activate()");
  assert.equal(await evaluate("document.getElementById('settings').textContent.indexOf('F1 fixture')>=0"),true,'Calendar must open today/tomorrow titles and times');
  assert.equal(await evaluate("document.querySelectorAll('#settings .row img').length"),0,'Calendar titles must never become HTML');
  const calendarGeometry=await evaluate(`(function(){var row=document.querySelector('#settings .row'),value=row.querySelector('.value').getBoundingClientRect(),range=document.createRange();range.selectNodeContents(row.firstChild);var label=range.getBoundingClientRect(),bounds=row.getBoundingClientRect();return {separate:value.top>=label.bottom,inside:value.right<=bounds.right&&value.bottom<=bounds.bottom}})()`);
  assert.deepEqual(calendarGeometry,{separate:true,inside:true},'Event title and time must not overlap or escape the row');
  await evaluate('FreeMyTV.activate()');
  assert.equal(await evaluate("document.getElementById('toast').textContent.indexOf('Long event title')>=0"),true,'OK reveals a long calendar title');

  await evaluate('FreeMyTV.back()');
  assert.equal(await evaluate("FreeMyTV.state.zone"),'widgets','Back restores calendar focus');
  const staleCalendar=await evaluate(`(function(){var previous=CONFIG.homeProfile.calendarFeed.today;try{CONFIG.homeProfile.calendarFeed.today='1999-01-01';FreeMyTV.activate();return FreeMyTV.state.zone}finally{CONFIG.homeProfile.calendarFeed.today=previous}})()`);
  assert.equal(staleCalendar,'widgets','Expired snapshot cannot reopen an old agenda');

  assert.equal(await evaluate("document.querySelectorAll('.news-image').length"),1,'Frank reports must render actual image cards');
  await wait(200);
  assert.equal(await evaluate("document.querySelector('.news-image').naturalWidth>0"),true,'Cached image must load without publisher requests');
  const news=await evaluate(`(function(){FreeMyTV.state.zone='dashboard';FreeMyTV.state.dashboard=2;FreeMyTV.state.news=0;FreeMyTV.move(1,0);var title=document.querySelector('.news-headline').textContent;FreeMyTV.activate();var view=FreeMyTV.state.tab;document.querySelectorAll('#tabs .tab')[0].click();return {title:title,view:view}})()`);
  assert.deepEqual(news,{title:'News fixture 1',view:1});
  assert.equal(await evaluate("document.querySelector('.news-meta').textContent.indexOf('Publicação não informada')>=0"),true,'Unknown publication cannot be replaced by analysis time');
  const pendingNews=await evaluate(`(function(){var feed=CONFIG.homeProfile.newsFeed;try{feed.items.forEach(function(item){item.ready=false});document.querySelectorAll('#tabs .tab')[1].click();return document.querySelectorAll('.news-image').length}finally{feed.items.forEach(function(item){item.ready=true});document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.equal(pendingNews,0,'Incomplete evidence removes previously displayed report artwork');
  const noNewsImage=await evaluate(`(function(){var item=CONFIG.homeProfile.newsFeed.items[0],image=item.image;try{item.image='';document.querySelectorAll('#tabs .tab')[1].click();return document.querySelector('.news-headline').getBoundingClientRect().left-document.querySelector('.dashboard-news').getBoundingClientRect().left}finally{item.image=image;document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.ok(noNewsImage<40,'Missing cached image must not leave a blank half-width column');


  const cancellation=await evaluate(`(function(){
    var old=TV.launch,oldDismiss=TV.dismissScreensaver,pending=[],dismissed=0;
    try {
      TV.launch=function(id,params,done){pending.push(done)};
      TV.dismissScreensaver=function(){dismissed++};
      FreeMyTV.showSaver();
      window.dispatchEvent(new Event('focus'));
      pending.shift()(true);
      var afterFocus=dismissed;
      FreeMyTV.showSaver();FreeMyTV.showSaver();
      pending.shift()(true);
      var afterOld=dismissed;
      pending.shift()(true);
      return {afterFocus:afterFocus,afterOld:afterOld};
    } finally {TV.launch=old;TV.dismissScreensaver=oldDismiss;document.dispatchEvent(new MouseEvent('mousemove'));}
  })()`);
  assert.deepEqual(cancellation,{afterFocus:1,afterOld:1},'Input cancels late saver launches and stale attempts cannot close a newer session');
  assert.deepEqual(errors,[]);
  const overflow = await evaluate("Array.prototype.some.call(document.querySelectorAll('#dashboard .dashboard-subtitle'),function(x){return x.clientWidth>0 && (x.scrollWidth>x.clientWidth || x.getBoundingClientRect().right>x.parentNode.getBoundingClientRect().right)})");
  assert.equal(overflow,false,'Panel subtitles must wrap within their card');
  if(process.env.DASHBOARD_SCREENSHOT){await evaluate("Prefs.set('theme','dark');Data.settingsChanged();document.getElementById('toast').className=''");await wait(2300);const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.DASHBOARD_SCREENSHOT,Buffer.from(shot.data,'base64'));}
  console.log(JSON.stringify({pass:true,tabs:4,fixedApps:expected,geometry,navigation,exactLaunches:true,launchFailure:true,diagnostics:true,pendingYouTubeExplicit:true,frankNews:true,cachedNewsImages:true,mediaCards:true,carouselNavigation:true,imageFailureFallback:true,personalCalendar:true,calendarStaleGuard:true,oledPolicyPreserved:true}));
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
