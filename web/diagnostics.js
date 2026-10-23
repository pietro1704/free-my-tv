/* Read-only samples, polled only while the diagnostics sheet is visible. */
var Diagnostics = (function () {
  'use strict';
  function parse(text) {
    function number(pattern) { var m = pattern.exec(text); return m ? Number(m[1]) : null; }
    var cpu = /^cpu\s+(.+)$/m.exec(text), counters = null;
    if (cpu) {
      counters = cpu[1].trim().split(/\s+/).slice(0, 8).map(Number);
      if (counters.length < 8 || counters.some(function (v) { return !isFinite(v) || v < 0; })) counters = null;
    }
    var total = number(/^MemTotal:\s+(\d+)/m), available = number(/^MemAvailable:\s+(\d+)/m);
    var panel = number(/^dispFramerate\s*:\s*(\d+)/m), rates = {0: 60, 1: 120, 3: 144};
    return {cpu: counters, totalMB: total === null ? null : total / 1024,
      usedMB: total !== null && available !== null && available <= total ? (total - available) / 1024 : null,
      compositorHz: number(/^\s*mode:\s*"[^"]+":\s+(\d+)/m),
      panelHz: panel !== null && rates[panel] !== undefined ? rates[panel] : null};
  }
  function percent(before, after) {
    if (!before || !after || before.length !== after.length) return null;
    var total = 0, idle = 0;
    for (var i = 0; i < after.length; i++) {
      var delta = after[i] - before[i];
      if (delta < 0) return null;
      total += delta;
      if (i === 3 || i === 4) idle += delta;
    }
    return total > 0 ? (total - idle) * 100 / total : null;
  }
  function monitor(read, timers) {
    timers = timers || window;
    var generation = 0, timer = null, deadline = null, cancel = null, previous = null;
    function stop() {
      generation++;
      if (timer !== null) timers.clearTimeout(timer);
      if (deadline !== null) timers.clearTimeout(deadline);
      timer = deadline = null;
      if (cancel) cancel();
      cancel = null;
      previous = null;
    }
    return {
      stop: stop,
      start: function (done) {
        stop();
        var session = generation;
        function sample() {
          if (session !== generation) return;
          var finished = false;
          function finish(text) {
            if (finished || session !== generation) return;
            finished = true;
            if (deadline !== null) timers.clearTimeout(deadline);
            deadline = null;
            var stats = parse(text || '');
            stats.cpuPercent = percent(previous, stats.cpu);
            previous = stats.cpu;
            done(stats);
            if (session === generation) timer = timers.setTimeout(sample, 5000);
          }
          deadline = timers.setTimeout(function () { if (cancel) cancel(); finish(null); }, 4000);
          var requestCancel = null;
          try { requestCancel = read(finish) || null; } catch (error) { finish(null); }
          if (session === generation && !finished) cancel = requestCancel;
          else if (requestCancel) requestCancel();
        }
        sample();
      }
    };
  }
  return {parse: parse, percent: percent, monitor: monitor};
})();
