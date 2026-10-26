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
      if(profile&&profile.youtubeFeed)profile.youtubeFeed.observedAt=new Date().toISOString();
      window.__config=value;
    }});
    window.__launches=[]; window.__launchParams=[]; window.__failLaunch=false;
    window.PalmServiceBridge=function(){
      this.cancel=function(){};
      this.call=function(uri,body){
        var self=this,p=JSON.parse(body),res={returnValue:true};
        if(uri.indexOf('getAppLoadStatus')>=0) res.exist=CONFIG.homeProfile.items.some(function(x){return x.id===p.appId});
        else if(uri.indexOf('getAllInputStatus')>=0) res.devices=[];
        else if(uri.indexOf('/launch')>=0){window.__launches.push(p.id);window.__launchParams.push(p.params||null);res.returnValue=!window.__failLaunch;}
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
  assert.equal(await evaluate("document.querySelectorAll('#buttons button').length"),1,'Dashboard header must have one controls entry');
  const header=await evaluate(`(function(){var title=document.getElementById('title').getBoundingClientRect(),tabs=document.getElementById('tabs').getBoundingClientRect(),button=document.querySelector('#buttons button').getBoundingClientRect(),content=document.getElementById('dashboard').getBoundingClientRect();return {compact:title.height<=40,sameRow:Math.abs(title.top-tabs.top)<25,separate:title.right<tabs.left&&tabs.right<button.left,above:Math.max(title.bottom,tabs.bottom,button.bottom)<content.top}})()`);
  assert.deepEqual(header,{compact:true,sameRow:true,separate:true,above:true});
  const topNavigation=await evaluate("FreeMyTV.state.zone='top';FreeMyTV.state.top=3;FreeMyTV.move(99,0);FreeMyTV.state.top");
  assert.equal(topNavigation,4,'Remote must stop at the one visible controls button');
  await evaluate("document.querySelector('#buttons button').click()");
  assert.equal(await evaluate("FreeMyTV.state.zone"),'settings');
  const controlLabels=await evaluate("Array.prototype.map.call(document.querySelectorAll('#settings .row'),function(x){return x.firstChild.textContent})");
  assert.ok(controlLabels[0].indexOf('HDMI')>=0,'Inputs remain accessible from the central menu');
  assert.ok(controlLabels[1].indexOf('CPU')>=0,'Diagnostics remain accessible from the central menu');
  assert.ok(controlLabels.some(x=>/TV/.test(x)),'TV settings remain accessible');
  await evaluate("FreeMyTV.state.row=1;FreeMyTV.activate()");
  assert.equal(await evaluate("document.querySelector('#settings .title').textContent"),'CPU · RAM · Hz');
  await evaluate("FreeMyTV.back();FreeMyTV.back()");
  assert.equal(await evaluate("FreeMyTV.state.zone==='top'&&FreeMyTV.state.top===4"),true,'Back from diagnostics then controls restores the header button');
  await evaluate("FreeMyTV.state.top=5;FreeMyTV.activate()");
  assert.equal(await evaluate("FreeMyTV.state.zone"),'top','Removed header actions cannot be activated by a stale index');
  await evaluate("FreeMyTV.state.top=4;document.querySelector('#buttons button').click()");
  const tvSettingsFailure=await evaluate(`(function(){var previous=TV.settings;try{TV.settings=function(done){done(false)};var rows=document.querySelectorAll('#settings .row');for(var i=0;i<rows.length;i++)if(/TV/.test(rows[i].firstChild.textContent)){rows[i].click();break}return document.getElementById('toast').textContent}finally{TV.settings=previous}})()`);
  assert.ok(tvSettingsFailure.length>0,'TV settings rejection must report a failure');
  assert.equal(await evaluate("document.querySelectorAll('#settings .row').length>0"),true,'Rejected external settings must leave controls usable');
  await evaluate("FreeMyTV.back()");
  await evaluate("document.querySelector('#buttons button').click();FreeMyTV.state.row=0;FreeMyTV.activate()");
  assert.equal(await evaluate("FreeMyTV.state.zone"),'drawer','HDMI action must open the input drawer');
  await evaluate("FreeMyTV.back();document.querySelectorAll('#tabs .tab')[0].click()");
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
  const contentRows=await evaluate(`(function(){FreeMyTV.state.zone='dashboard';FreeMyTV.state.dashboard=0;FreeMyTV.state.video=0;FreeMyTV.move(-1,0);return ['youtube','media'].map(function(key){var panel=document.querySelector('[data-panel='+key+']'),style=getComputedStyle(panel);return {background:style.backgroundColor,border:style.borderTopColor}})})()`);
  assert.deepEqual(contentRows,[{background:'rgba(0, 0, 0, 0)',border:'rgba(0, 0, 0, 0)'},{background:'rgba(0, 0, 0, 0)',border:'rgba(0, 0, 0, 0)'}],'Content rows must leave the stage visible instead of painting outer boxes, including while focused');
  assert.equal(await evaluate("document.querySelector('.video-card.selected')!==null"),true,'Removing the outer frame must retain selected artwork');
  const emptyMediaFocus=await evaluate(`(function(){var feed=CONFIG.homeProfile.mediaFeed;try{CONFIG.homeProfile.mediaFeed=null;document.querySelectorAll('#tabs .tab')[2].click();FreeMyTV.state.zone='dashboard';FreeMyTV.state.dashboard=0;FreeMyTV.move(-1,0);var panel=document.querySelector('[data-panel=media]');return {underline:getComputedStyle(panel.querySelector('.dashboard-title')).textDecorationLine.indexOf('underline')>=0,background:getComputedStyle(panel).backgroundColor,cards:panel.querySelectorAll('.media-card').length}}finally{CONFIG.homeProfile.mediaFeed=feed;document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(emptyMediaFocus,{underline:true,background:'rgba(0, 0, 0, 0)',cards:0},'Disconnected media must retain a visible focus cue without a large highlighted box');
  await evaluate("FreeMyTV.state.zone='top';FreeMyTV.state.top=0;FreeMyTV.move(0,1)");
  await wait(200);
  const focusedVideo=await evaluate(`(function(){var card=document.querySelector('.video-card.selected'),viewport=document.querySelector('.video-viewport').getBoundingClientRect(),r=card.getBoundingClientRect(),details=document.getElementById('focus-details');return {grown:r.width>card.offsetWidth,inside:r.left>=viewport.left&&r.right<=viewport.right&&r.top>=viewport.top&&r.bottom<=viewport.bottom,details:!!details&&getComputedStyle(details).display!=='none'&&details.textContent.indexOf('YouTube fixture 0')>=0,dockHidden:getComputedStyle(document.getElementById('tiles')).visibility==='hidden'}})()`);
  assert.deepEqual(focusedVideo,{grown:true,inside:true,details:true,dockHidden:true},'Focused artwork must grow without clipping and show its complete details in place of the dock');
  const focusStampGap=await evaluate("document.querySelector('.video-stamp').getBoundingClientRect().top-document.querySelector('.video-card.selected').getBoundingClientRect().bottom");
  assert.ok(focusStampGap>=1,'Focus outline must not cover the snapshot timestamp; gap='+focusStampGap);
  await evaluate("FreeMyTV.move(0,1)");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('focus-details')).display==='none'&&getComputedStyle(document.getElementById('tiles')).visibility==='visible'"),true,'Leaving media must dismiss details and restore the dock');
  const pointer=await evaluate("(function(){var r=document.querySelectorAll('.media-card')[1].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+50}})()");
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...pointer});
  assert.equal(await evaluate("FreeMyTV.state.media===1&&document.querySelector('#focus-details .focus-title').textContent==='Fixture title 1'"),true,'Moving the pointer selects the actual hovered card');
  await evaluate("FreeMyTV.move(-1,0)");await wait(200);
  await evaluate(`document.querySelectorAll('.media-card')[1].dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:${pointer.x},clientY:${pointer.y}}))`);
  assert.equal(await evaluate("FreeMyTV.state.media"),0,'Stationary pointer events must not undo remote selection');
  assert.equal(await evaluate("document.getElementById('focus-details').textContent.indexOf('T1 · E2 · 25%')>=0&&document.getElementById('focus-details').textContent.indexOf('Episode fixture')>=0"),true,'Nuvio details retain known episode, title and progress');
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x+1,y:pointer.y});
  assert.equal(await evaluate("FreeMyTV.state.media===1&&document.getElementById('focus-details').textContent.indexOf('Episode fixture')<0"),true,'A genuine pointer move can select again and clears the previous episode');
  await evaluate("document.querySelector('#buttons button').click()");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('focus-details')).display==='none'&&document.getElementById('focus-details').textContent===''"),true,'Opening controls cancels and clears media details');
  await evaluate("FreeMyTV.back();document.querySelectorAll('#tabs .tab')[0].click()");
  const withdrawnDetails=await evaluate(`(function(){var feed=CONFIG.homeProfile.youtubeFeed;try{FreeMyTV.state.zone='top';FreeMyTV.state.top=0;FreeMyTV.move(0,1);feed.accountConfirmed=false;FreeMyTV.move(1,0);var before=window.__launches.length;FreeMyTV.activate();return {hidden:getComputedStyle(document.getElementById('focus-details')).display==='none',empty:document.getElementById('focus-details').textContent==='',noLaunch:window.__launches.length===before}}finally{feed.accountConfirmed=true;document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(withdrawnDetails,{hidden:true,empty:true,noLaunch:true},'Withdrawn account identity cannot retain details or launch stale content');
  const reorderedSelection=await evaluate(`(function(){var row=CONFIG.homeProfile.youtubeFeed.items[0],rank=row.rank;try{FreeMyTV.state.zone='top';FreeMyTV.state.top=0;FreeMyTV.state.video=0;FreeMyTV.move(0,1);row.rank=99;var before=window.__launches.length;FreeMyTV.activate();return {launches:window.__launches.length-before,selected:YouTubeFeed.items(HomeProfile.config)[FreeMyTV.state.video].id}}finally{row.rank=rank;document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(reorderedSelection,{launches:0,selected:'VIDEO000001'},'A reordered feed must preserve the selected identity and refresh before opening a video');
  const longFocus=await evaluate(`(function(){var row=CONFIG.homeProfile.youtubeFeed.items[0],old={title:row.title,channel:row.channel,publishedText:row.publishedText};try{row.title='<img src=x onerror=bad()> '+new Array(271).join('W');row.channel=new Array(181).join('W');row.publishedText=new Array(81).join('W');document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click();FreeMyTV.state.zone='top';FreeMyTV.state.top=0;FreeMyTV.state.video=0;FreeMyTV.move(0,1);var details=document.getElementById('focus-details');return {full:details.querySelector('.focus-title').textContent===row.title.slice(0,300),noHTML:details.querySelectorAll('img').length===0,fits:details.scrollHeight<=details.clientHeight,overflow:details.scrollHeight-details.clientHeight}}finally{row.title=old.title;row.channel=old.channel;row.publishedText=old.publishedText;document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(longFocus,{full:true,noHTML:true,fits:true,overflow:0},'Long untrusted titles and metadata must fit the details strip as plain text');
  assert.deepEqual(await evaluate("Array.prototype.map.call(document.querySelectorAll('#home-widgets button'),function(x){return x.getAttribute('data-widget')})"),['arch','weather','calendar','webosbrew']);
  const compactWidgets=await evaluate(`(function(){return Array.prototype.map.call(document.querySelectorAll('.home-widget'),function(card){var r=card.getBoundingClientRect(),title=card.querySelector('.widget-title').getBoundingClientRect(),status=card.querySelector('.widget-status').getBoundingClientRect(),detail=card.querySelector('.widget-detail').getBoundingClientRect();return {compact:r.height<=160,aligned:Math.round(r.top),separate:title.bottom<=status.top&&status.bottom<=detail.top,bounded:detail.bottom<r.bottom,twoLines:detail.height<=48}})})()`);
  assert.equal(new Set(compactWidgets.map(x=>x.aligned)).size,1,'All four information cards must share one baseline');
  compactWidgets.forEach(widget=>assert.deepEqual({...widget,aligned:0},{compact:true,aligned:0,separate:true,bounded:true,twoLines:true},'Widgets reserve two readable detail rows inside a compact card'));
  const longWidget=await evaluate(`(function(){var feed=CONFIG.homeProfile.calendarFeed,original=feed.events[0].title;try{feed.events[0].title='<img src=x> '+new Array(301).join('W');Data.settingsChanged();var card=document.querySelector('[data-widget=calendar]'),detail=card.querySelector('.widget-detail'),r=card.getBoundingClientRect(),d=detail.getBoundingClientRect();return {plain:card.querySelectorAll('img').length===0,contained:d.bottom<r.bottom&&d.right<r.right,bounded:d.height<=48,clipped:detail.firstChild.scrollWidth>detail.firstChild.clientWidth,tomorrow:detail.children.length===2&&detail.children[1].getBoundingClientRect().bottom<r.bottom}}finally{feed.events[0].title=original;Data.settingsChanged()}})()`);
  assert.deepEqual(longWidget,{plain:true,contained:true,bounded:true,clipped:true,tomorrow:true},'Long calendar titles must stay bounded and available in the full agenda');
  const expiredWidget=await evaluate(`(function(){var feed=CONFIG.homeProfile.calendarFeed,original=feed.today;try{feed.today='1999-01-01';Data.settingsChanged();var card=document.querySelector('[data-widget=calendar]');return {cleared:card.textContent.indexOf('Agenda fixture')<0,rows:card.querySelectorAll('.widget-line').length,compact:card.getBoundingClientRect().height<=160}}finally{feed.today=original;Data.settingsChanged()}})()`);
  assert.deepEqual(expiredWidget,{cleared:true,rows:1,compact:true},'Expired calendar data must replace event rows with the bounded unavailable state');
  for(let tab=0;tab<4;tab++) {
    await evaluate(`document.querySelectorAll('#tabs .tab')[${tab}].click();FreeMyTV.state.zone='widgets';FreeMyTV.state.widget=0;FreeMyTV.move(-1,0)`);
    for(let index=0;index<4;index++) {
      if(index) await evaluate('FreeMyTV.move(1,0)');
      assert.equal(await evaluate(`document.querySelector('.home-widget.focus').getAttribute('data-widget')`),['arch','weather','calendar','webosbrew'][index],'Every compact widget must retain its remote focus identity across tabs');
    }
  }
  await evaluate("document.querySelectorAll('#tabs .tab')[0].click()");
  const navigation=await evaluate(`(function(){FreeMyTV.state.zone='top';FreeMyTV.state.top=0;FreeMyTV.state.video=2;FreeMyTV.move(0,1);var order=[FreeMyTV.state.zone];FreeMyTV.move(1,0);order.push(HomeDashboard.items(0)[FreeMyTV.state.dashboard]);FreeMyTV.move(0,1);order.push(HomeDashboard.items(0)[FreeMyTV.state.dashboard]);FreeMyTV.move(0,1);order.push(FreeMyTV.state.zone);FreeMyTV.move(0,1);order.push(FreeMyTV.state.zone);return order})()`);
  assert.deepEqual(navigation,['dashboard','media','news','widgets','shelf']);
  await evaluate("document.querySelector('[data-panel=youtube]').click();document.querySelector('[data-panel=media]').click()");
  assert.deepEqual(await evaluate('window.__launches.slice(-2)'),['com.cobalt.youtube.adfree','space.nuvio.webos']);
  await evaluate("window.__failLaunch=true;document.querySelector('[data-panel=media]').click();window.__failLaunch=false");
  assert.equal(await evaluate("document.getElementById('toast').className.indexOf('on')>=0"),true);
  await evaluate("document.querySelectorAll('#tabs .tab')[3].click();FreeMyTV.move(1,0);FreeMyTV.activate()");
  assert.equal(await evaluate("FreeMyTV.state.zone==='settings'"),true,'Fourth tab must not consume the controls button');
  await evaluate("FreeMyTV.back();FreeMyTV.back();document.querySelectorAll('#tabs .tab')[0].click()");
  assert.equal(await evaluate("document.querySelectorAll('#cards .card').length"),0);
  assert.equal(await evaluate('CONFIG.homeProfile.idleMinutes'),0.25);
  assert.equal(await evaluate("document.querySelectorAll('.media-card').length"),3,'Nuvio snapshot must render image cards');
  assert.equal(await evaluate("document.querySelectorAll('.media-card img').length"),3);
  const mediaLayout=await evaluate(`(function(){var card=document.querySelector('.media-card'),art=card.querySelector('img').getBoundingClientRect(),title=card.querySelector('.media-name').getBoundingClientRect(),detail=card.querySelector('.media-detail'),progress=card.querySelector('.media-progress');return {ratio:Math.round(art.width/art.height*1000),titleBelow:title.top>=art.bottom,episode:!!detail&&detail.textContent.indexOf('T1 · E2')>=0,progress:!!progress&&Math.abs(progress.getBoundingClientRect().width/card.clientWidth-0.25)<0.01}})()`);
  assert.deepEqual(mediaLayout,{ratio:1778,titleBelow:true,episode:true,progress:true},'Home Nuvio cards must show landscape art, episode and actual progress');
  assert.equal(await evaluate("document.querySelector('.dashboard-media .dashboard-title').getBoundingClientRect().bottom <= document.querySelector('.media-viewport').getBoundingClientRect().top"),true,'Nuvio heading must stay above its artwork');
  await wait(500);
  assert.equal(await evaluate("document.querySelectorAll('.media-card img.failed').length"),2,'Blocked images must keep title fallback');
  assert.equal(await evaluate("document.querySelectorAll('.media-card img[src]').length"),3,'Only visible artwork and one next card may load');
  assert.equal(await evaluate("document.querySelector('.media-card img').naturalWidth>0"),true,'Cached Nuvio artwork must decode offline');
  await evaluate("document.querySelectorAll('#tabs .tab')[2].click()");
  const posterLayout=await evaluate(`(function(){var card=document.querySelector('.media-card'),image=card.querySelector('img').getBoundingClientRect(),viewport=document.querySelector('.media-viewport').getBoundingClientRect(),shelf=document.getElementById('platter').getBoundingClientRect();return {ratio:Math.round(image.width/image.height*1000),inside:card.getBoundingClientRect().bottom<=viewport.bottom,screen:shelf.bottom<=1080}})()`);
  assert.deepEqual(posterLayout,{ratio:667,inside:true,screen:true},'Media tab must show vertical posters without clipping cards or app shortcuts');
  const posterCarousel=await evaluate(`(async function(){var feed=CONFIG.homeProfile.mediaFeed,original=feed.items.slice();try{
    for(var i=0;i<10;i++)feed.items.push({id:'extra-'+i,title:'Extra poster '+i,kind:'movie',section:'library',updatedAt:0,image:original[0].image});
    document.querySelectorAll('#tabs .tab')[0].click();document.querySelectorAll('#tabs .tab')[2].click();
    FreeMyTV.state.zone='dashboard';FreeMyTV.state.dashboard=0;FreeMyTV.state.media=0;for(var step=0;step<9;step++)FreeMyTV.move(1,0);await new Promise(function(resolve){setTimeout(resolve,200)});
    var card=document.querySelectorAll('.media-card')[9].getBoundingClientRect(),viewport=document.querySelector('.media-viewport').getBoundingClientRect();FreeMyTV.activate();
    return {selected:FreeMyTV.state.media,visible:card.left>=viewport.left&&card.right<=viewport.right,last:window.__launches[window.__launches.length-1],farImageNotLoaded:!document.querySelectorAll('.media-card')[12].querySelector('img').getAttribute('src')};
  }finally{feed.items=original;document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(posterCarousel,{selected:9,visible:true,last:'space.nuvio.webos',farImageNotLoaded:true},'Vertical poster navigation must keep focus visible, launch only Nuvio and defer distant artwork');
  await evaluate("document.querySelectorAll('#tabs .tab')[0].click()");
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

  assert.equal(await evaluate("document.querySelectorAll('.news-card').length"),2,'Ready Frank reports must render as individual cards');
  assert.equal(await evaluate("document.querySelectorAll('.news-card .news-image').length"),2);
  await wait(200);
  assert.equal(await evaluate("document.querySelector('.news-image').naturalWidth>0"),true,'Cached news photos must decode offline');
  const newsCarousel=await evaluate(`(async function(){var feed=CONFIG.homeProfile.newsFeed,original=feed.items.slice();try{
    for(var i=0;i<4;i++){var row={};Object.keys(original[0]).forEach(function(k){row[k]=original[0][k]});row.id='extra-news-'+i;row.title='Extra news '+i;feed.items.push(row)}
    document.querySelectorAll('#tabs .tab')[1].click();FreeMyTV.state.zone='top';FreeMyTV.state.top=1;FreeMyTV.state.news=0;FreeMyTV.move(0,1);for(var step=0;step<5;step++)FreeMyTV.move(1,0);await new Promise(function(resolve){setTimeout(resolve,200)});
    var card=document.querySelector('.news-card.selected').getBoundingClientRect(),viewport=document.querySelector('.news-viewport').getBoundingClientRect();FreeMyTV.activate();return {inside:card.left>=viewport.left&&card.right<=viewport.right&&card.top>=viewport.top&&card.bottom<=viewport.bottom,title:document.querySelector('.report-headline').textContent};
  }finally{FreeMyTV.back();feed.items=original;document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(newsCarousel,{inside:true,title:'Extra news 3'},'The last news card must remain visible and open the matching report');
  await evaluate("FreeMyTV.state.zone='dashboard';FreeMyTV.state.dashboard=2;FreeMyTV.state.news=0;FreeMyTV.move(1,0)");
  assert.equal(await evaluate("document.querySelector('.news-card.selected .news-headline').textContent"),'News fixture 1');
  assert.equal(await evaluate("document.querySelector('.news-card.selected .news-meta').textContent.indexOf('Publicação não informada')>=0"),true);
  await evaluate("FreeMyTV.activate()");
  assert.equal(await evaluate("FreeMyTV.state.zone"),'report','OK must open the selected saved report');
  assert.equal(await evaluate("document.getElementById('news-report').textContent.indexOf('News summary fixture 1')>=0"),true);
  const reportGuard=await evaluate("(function(){var before=window.__launches.length;document.querySelector('.video-card').click();return {same:FreeMyTV.state.zone==='report',noLaunch:window.__launches.length===before}})()");
  assert.deepEqual(reportGuard,{same:true,noLaunch:true},'An open report must block artwork behind it');
  await evaluate("FreeMyTV.back()");
  assert.equal(await evaluate("FreeMyTV.state.zone==='dashboard'&&FreeMyTV.state.news===1"),true,'Back restores the same news selection');
  await evaluate("FreeMyTV.move(-1,0);FreeMyTV.activate()");
  assert.equal(await evaluate("document.getElementById('news-report').textContent.indexOf('needs_more_evidence')>=0&&document.getElementById('news-report').textContent.indexOf('not_checkable')>=0&&document.getElementById('news-report').textContent.indexOf('Análise com limitações')>=0"),true,'Frank uncertainty and degraded analysis must stay explicit');
  await evaluate("FreeMyTV.move(0,1)");
  assert.equal(await evaluate("document.querySelector('.report-scroll').scrollTop>0"),true,'Remote arrows must scroll long saved reports');
  const withdrawnReport=await evaluate(`(function(){var row=CONFIG.homeProfile.newsFeed.items[0];try{row.ready=false;FreeMyTV.move(0,1);return {closed:FreeMyTV.state.zone!=='report',empty:document.getElementById('news-report').textContent===''}}finally{row.ready=true;document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(withdrawnReport,{closed:true,empty:true},'Readiness withdrawn during reading must dismiss and clear the old report');
  const missingNews=await evaluate(`(function(){var feed=CONFIG.homeProfile.newsFeed;try{feed.items.forEach(function(x){x.ready=false});document.querySelectorAll('#tabs .tab')[1].click();return {cards:document.querySelectorAll('.news-card').length,reader:getComputedStyle(document.getElementById('news-report')).visibility}}finally{feed.items.forEach(function(x){x.ready=true});document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.equal(missingNews.cards,0,'Pending evidence removes cached report cards');
  const noNewsImage=await evaluate(`(function(){var row=CONFIG.homeProfile.newsFeed.items[0],image=row.image;try{row.image='';document.querySelectorAll('#tabs .tab')[1].click();var card=document.querySelector('.news-card');return card.querySelector('.news-headline').getBoundingClientRect().left-card.getBoundingClientRect().left}finally{row.image=image;document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.ok(noNewsImage<40,'Missing image must retain a readable headline without a blank image column');

  assert.equal(await evaluate("document.querySelectorAll('.video-card').length"),3,'YouTube subscriptions must render image cards');
  const videoLayout=await evaluate(`(function(){var card=document.querySelector('.video-card'),image=card.querySelector('img').getBoundingClientRect(),name=card.querySelector('.video-name').getBoundingClientRect(),channel=card.querySelector('.video-channel').getBoundingClientRect(),viewport=document.querySelector('.video-viewport').getBoundingClientRect(),shelf=document.getElementById('platter').getBoundingClientRect();return {ratio:Math.round(image.width/image.height*1000),titleBelow:name.top>=image.bottom,channelBelow:channel.top>=name.bottom,inside:channel.bottom<=viewport.bottom,screen:shelf.bottom<=1080}})()`);
  assert.deepEqual(videoLayout,{ratio:1778,titleBelow:true,channelBelow:true,inside:true,screen:true},'16:9 thumbnails and both text lines must stay separate and within the TV');
  const videos=await evaluate(`(function(){FreeMyTV.state.zone='dashboard';FreeMyTV.state.dashboard=0;FreeMyTV.state.video=0;FreeMyTV.move(1,0);var selected=FreeMyTV.state.video;document.querySelector('.video-card').click();return {selected:selected,id:window.__launches[window.__launches.length-1],params:window.__launchParams[window.__launchParams.length-1]}})()`);
  assert.deepEqual(videos,{selected:1,id:'com.cobalt.youtube.adfree',params:{contentTarget:'https://www.youtube.com/watch?v=VIDEO000001'}});
  assert.equal(await evaluate("document.querySelectorAll('.video-card img[src]').length"),3);
  assert.equal(await evaluate("document.querySelector('.video-card img').naturalWidth>0"),true,'Subscription artwork loads offline');
  const videoCarousel=await evaluate(`(async function(){var feed=CONFIG.homeProfile.youtubeFeed,original=feed.items.slice();try{
    for(var i=4;i<=7;i++)feed.items.push({id:'VIDEO00000'+i,title:'Extra subscription '+i,channel:'Creator',rank:i,image:original[0].image});
    document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click();
    FreeMyTV.state.zone='dashboard';FreeMyTV.state.dashboard=0;FreeMyTV.state.video=0;
    for(var step=0;step<5;step++)FreeMyTV.move(1,0);await new Promise(function(resolve){setTimeout(resolve,200)});
    var card=document.querySelectorAll('.video-card')[5].getBoundingClientRect(),viewport=document.querySelector('.video-viewport').getBoundingClientRect();FreeMyTV.activate();
    return {selected:FreeMyTV.state.video,visible:card.left>=viewport.left&&card.right<=viewport.right,params:window.__launchParams[window.__launchParams.length-1]};
  }finally{feed.items=original;document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(videoCarousel,{selected:5,visible:true,params:{contentTarget:'https://www.youtube.com/watch?v=VIDEO000006'}},'Scrolling thumbnails must keep the focused video and exact target aligned');
  const missingVideoArt=await evaluate(`(function(){var row=CONFIG.homeProfile.youtubeFeed.items[0],image=row.image,title=row.title,channel=row.channel;try{
    row.image='';row.title='<img src=x onerror=bad()> '+new Array(30).join('Long title ');row.channel=new Array(30).join('Long channel ');
    document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click();
    var card=document.querySelector('.video-card'),art=card.querySelector('.video-art').getBoundingClientRect(),name=card.querySelector('.video-name').getBoundingClientRect(),channelRect=card.querySelector('.video-channel').getBoundingClientRect();
    return {reserved:Math.abs(art.width/art.height-16/9)<0.01,titleBelow:name.top>=art.bottom,channelBelow:channelRect.top>=name.bottom,noHTML:card.querySelectorAll('.video-name img').length===0,titleVisible:name.height>0&&parseFloat(getComputedStyle(card.querySelector('.video-name')).height)<=48,channelInside:channelRect.bottom<=card.getBoundingClientRect().bottom};
  }finally{row.image=image;row.title=title;row.channel=channel;document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.deepEqual(missingVideoArt,{reserved:true,titleBelow:true,channelBelow:true,noHTML:true,titleVisible:true,channelInside:true},'Missing thumbnails and long untrusted titles must preserve the text layout');
  await evaluate("document.querySelector('.video-card img').src='data:image/png;base64,aGVsbG8='");
  await wait(100);
  assert.equal(await evaluate("document.querySelector('.video-card img').className==='failed' && document.querySelector('.video-name').getBoundingClientRect().top>=document.querySelector('.video-art').getBoundingClientRect().bottom"),true,'Decode failure keeps title below the reserved image');
  await evaluate("document.querySelectorAll('#tabs .tab')[1].click();document.querySelectorAll('#tabs .tab')[0].click()");
  await evaluate("window.__failLaunch=true;document.querySelector('.video-card').click();window.__failLaunch=false");
  await wait(100);
  const videoFailure=await evaluate("document.getElementById('toast').textContent");
  assert.ok(videoFailure.indexOf('YouTube')>=0,'Launch rejection must remain visible');
  const hiddenVideo=await evaluate(`(function(){document.querySelectorAll('#tabs .tab')[1].click();var before=window.__launches.length;document.querySelector('.video-card').click();document.querySelectorAll('#tabs .tab')[0].click();return window.__launches.length-before})()`);
  assert.equal(hiddenVideo,0,'Hidden subscription cards cannot launch');
  const identityVideo=await evaluate(`(function(){var feed=CONFIG.homeProfile.youtubeFeed;try{feed.accountConfirmed=false;document.querySelector('.video-card').click();return {cards:document.querySelectorAll('.video-card').length,last:window.__launches.length}}finally{feed.accountConfirmed=true;document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.equal(identityVideo.cards,0,'Loss of account confirmation removes stale video cards');
  const staleVideo=await evaluate(`(function(){var feed=CONFIG.homeProfile.youtubeFeed,at=feed.observedAt;try{feed.observedAt='1999-01-01';document.querySelectorAll('#tabs .tab')[0].click();return document.querySelectorAll('.video-card').length}finally{feed.observedAt=at;document.querySelectorAll('#tabs .tab')[0].click()}})()`);
  assert.equal(staleVideo,0,'Expired snapshots cannot retain subscription artwork');
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
  console.log(JSON.stringify({pass:true,tabs:4,compactHeader:true,unifiedControls:true,controlsBackFocus:true,removedActionGuard:true,fixedApps:expected,geometry,navigation,exactLaunches:true,launchFailure:true,diagnostics:true,youtubeCards:true,youtubeIdentityAndStaleGuard:true,frankNews:true,cachedNewsImages:true,mediaCards:true,carouselNavigation:true,imageFailureFallback:true,personalCalendar:true,calendarStaleGuard:true,oledPolicyPreserved:true}));
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
