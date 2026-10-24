/* Fixed rooted-TV entry point. Never open an unmanaged screensaver as a fallback. */
var NativeSaver = (function () {
  'use strict';
  var executable = '/bin/sh /var/lib/webosbrew/lg-controls/native-saver.sh ';
  function command(params) {
    var n = params && params.idleElapsedMs;
    if (!params || params.idleSource !== 'freemytv' || typeof n !== 'number' || !isFinite(n) || n < 0 || n > 1800000) return null;
    return executable + Math.floor(n);
  }
  function ok(text) {
    try {var value = JSON.parse(text);return value.returnValue === true && value.state === 'Screen Saver';}
    catch (error) {return false;}
  }
  return {command:command, closeCommand:executable + 'close', ok:ok};
})();
