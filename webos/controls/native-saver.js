/* Enter the native TV power state as well as opening the saver window. */
'use strict';
var APP = 'com.webos.app.screensaver';
function start(call, elapsed, wait) {
  var launched = false, stage = 'state';
  if (typeof elapsed !== 'number' || !isFinite(elapsed) || elapsed < 0 || elapsed > 1800000) return {returnValue:false, stage:'parameters'};
  try {
    var state = call('com.webos.service.tvpower/power/getPowerState', {});
    if (state.returnValue === true && state.state === 'Screen Saver') return {returnValue:true, state:'Screen Saver'};
    if (state.returnValue !== true || state.state !== 'Active') return {returnValue:false, stage:'inactive'};
    stage = 'foreground';
    var foreground = call('com.webos.applicationManager/getForegroundAppInfo', {});
    if (foreground.returnValue !== true || foreground.appId !== 'io.freemytv') return {returnValue:false, stage:'background'};
    stage = 'launch';
    var result = call('com.webos.applicationManager/launch', {id:APP, params:{idleSource:'freemytv', idleElapsedMs:Math.floor(elapsed)}});
    if (result.returnValue !== true) return {returnValue:false, stage:stage};
    launched = true;
    stage = 'native';
    result = call('com.webos.service.tvpower/power/turnOnScreenSaver', {});
    if (result.returnValue !== true && result.errorCode !== -100) throw new Error('native entry rejected');
    stage = 'confirmation';
    for (var i = 0; i < 25; i++) {
      state = call('com.webos.service.tvpower/power/getPowerState', {});
      if (state.returnValue === true && state.state === 'Screen Saver') return {returnValue:true, state:'Screen Saver'};
      wait(100);
    }
  } catch (error) {}
  if (launched) {try {call('com.webos.applicationManager/closeByAppId', {id:APP});} catch (error) {}}
  return {returnValue:false, stage:stage};
}
function close(call) {
  try {call('com.webos.applicationManager/closeByAppId', {id:APP});return {returnValue:true};}
  catch (error) {return {returnValue:false};}
}
module.exports = {start:start, close:close};
if (require.main === module) {
  var child = require('child_process');
  function call(method, payload) {
    var output = child.execFileSync('luna-send', ['-n','1','luna://' + method,JSON.stringify(payload)], {stdio:[0,'pipe','pipe'],timeout:4000});
    return JSON.parse(String(output));
  }
  var output = process.argv[2] === 'close' ? close(call) : start(call, Number(process.argv[2]), function(ms) {child.execFileSync('sleep',[String(ms / 1000)]);});
  process.stdout.write(JSON.stringify(output) + '\n');
}
