/* Shared by the web launcher and the native OLED screensaver. Milliseconds throughout. */
var IdlePolicy = (function () {
  'use strict';
  function saverDelay(minutes) {
    return typeof minutes === 'number' && isFinite(minutes) && minutes > 0 ? Math.max(15000, Math.round(minutes * 60000)) : 300000;
  }
  function elapsedFromArgs(args, fallback) {
    for (var i = 0; args && i < args.length; i++) {
      try {
        var value = JSON.parse(args[i]), p = value.parameters || value.params || value;
        if (p.idleSource === 'freemytv' && typeof p.idleElapsedMs === 'number' && isFinite(p.idleElapsedMs) && p.idleElapsedMs >= 0) return Math.min(p.idleElapsedMs, 1800000);
      } catch (error) {}
    }
    return fallback;
  }
  function remaining(elapsed, budget) { return Math.max(1000, budget - elapsed); }
  function due(now, lastInput, hidden, nextAttempt, delay) {
    return !hidden && now >= nextAttempt && now - lastInput >= delay;
  }
  return {saverDelay: saverDelay, elapsedFromArgs: elapsedFromArgs, remaining: remaining, due: due};
})();
