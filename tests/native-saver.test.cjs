const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const native=require('../webos/controls/native-saver.js');
function harness(options={}) {
 const calls=[];let states=0;
 return {calls,call(method,payload) {
  calls.push({method,payload});
  if(options.throwAt===method)throw Error('transport');
  if(method.endsWith('/getPowerState')) {states++;return {returnValue:true,state:options.state|| (states===1||options.neverReady?'Active':'Screen Saver')};}
  if(method.endsWith('/getForegroundAppInfo'))return {returnValue:true,appId:options.foreground||'io.freemytv'};
  if(method.endsWith('/launch'))return {returnValue:!options.launchFails};
  if(method.endsWith('/turnOnScreenSaver'))return {returnValue:!options.nativeFails};
  return {returnValue:true};
 }};
}
test('native entry launches exact identity with elapsed time and confirms managed state',()=>{
 const h=harness(),out=native.start(h.call,15000,()=>{});
 assert.deepEqual(out,{returnValue:true,state:'Screen Saver'});
 assert.deepEqual(h.calls.find(x=>x.method.endsWith('/launch')).payload,{id:'com.webos.app.screensaver',params:{idleSource:'freemytv',idleElapsedMs:15000}});
 assert.ok(h.calls.some(x=>x.method.endsWith('/turnOnScreenSaver')));
 assert.ok(!h.calls.some(x=>x.method.endsWith('/closeByAppId')));
});
test('background and inactive TVs never launch; already managed saver is not restarted',()=>{
 for(const option of [{foreground:'space.nuvio.webos'},{state:'Active Standby'},{state:'Screen Saver'}]) {
  const h=harness(option),out=native.start(h.call,15000,()=>{});
  assert.equal(out.returnValue,option.state==='Screen Saver');assert.equal(h.calls.some(x=>x.method.endsWith('/launch')),false);
 }
});
test('failed or timed-out native transition closes the otherwise unmanaged overlay',()=>{
 for(const option of [{nativeFails:true},{neverReady:true},{throwAt:'com.webos.service.tvpower/power/turnOnScreenSaver'}]) {
  const h=harness(option);assert.equal(native.start(h.call,15000,()=>{}).returnValue,false);
  assert.deepEqual(h.calls.at(-1),{method:'com.webos.applicationManager/closeByAppId',payload:{id:'com.webos.app.screensaver'}});
 }
 const h=harness({launchFails:true});assert.equal(native.start(h.call,15000,()=>{}).returnValue,false);assert.equal(h.calls.some(x=>x.method.endsWith('/turnOnScreenSaver')),false);
});
test('shell boundary accepts only finite elapsed time and an exact native confirmation',()=>{
 const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('web/native-saver.js','utf8'),c);const p=c.NativeSaver;
 assert.ok(p.command({idleSource:'freemytv',idleElapsedMs:15000}).endsWith(' 15000'));
 for(const value of [null,{}, {idleSource:'other',idleElapsedMs:1},{idleSource:'freemytv',idleElapsedMs:'1; command'},{idleSource:'freemytv',idleElapsedMs:Infinity},{idleSource:'freemytv',idleElapsedMs:-1}])assert.equal(p.command(value),null);
 assert.equal(p.ok('{"returnValue":true,"state":"Screen Saver"}'),true);
 for(const value of ['bad','null','{"returnValue":true,"state":"Active"}','{"state":"Screen Saver"}'])assert.equal(p.ok(value),false);
});

test('webOS uses the managed helper rather than launching an unmanaged native window',()=>{
 const requests=[],config={homeProfile:{nativeScreensaver:true}},c={window:{CONFIG:config},setTimeout(){},clearTimeout(){},localStorage:{getItem(){return null}}};
 c.window.PalmServiceBridge=function(){this.call=(uri,payload)=>{requests.push({uri,payload:JSON.parse(payload)});this.onservicecallback(JSON.stringify({returnValue:true,stdoutString:'{"returnValue":true,"state":"Screen Saver"}'}))}};
 vm.createContext(c);for(const name of ['native-saver.js','tv.js'])vm.runInContext(fs.readFileSync('web/'+name,'utf8'),c);
 let ok;c.TV.launch('com.webos.app.screensaver',{idleSource:'freemytv',idleElapsedMs:15000},value=>ok=value);assert.equal(ok,true);
 assert.equal(requests[0].uri,'luna://org.webosbrew.hbchannel.service/exec');assert.ok(requests[0].payload.command.endsWith(' 15000'));
 requests.length=0;c.TV.launch('com.webos.app.screensaver',{idleElapsedMs:15000},value=>ok=value);assert.equal(ok,false);assert.equal(requests.length,0);
 c.TV.launch('space.nuvio.webos',null,()=>{});assert.equal(requests[0].uri,'luna://com.webos.applicationManager/launch');
});
