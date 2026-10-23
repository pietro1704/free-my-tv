/* Slow read-only widgets; leaving the home cancels work and ignores previous callbacks. */
var HomeWidgets = (function () {
  'use strict';
  function controller(readLab, readBrew, timers, changed) {
    var active = false, state = {lab: {loading: true}, brew: {loading: true}};
    var lab = Diagnostics.monitor(readLab, timers, {parse: Homelab.parse, every: 30000, warmup: 1500, timeout: 8000});
    var brew = Diagnostics.monitor(readBrew, timers, {parse: function (text) {
      try {
        var value = JSON.parse(text);
        return value && typeof value.available === 'boolean' && (!value.available || Object.prototype.toString.call(value.updates) === '[object Array]') ? value : {available: false};
      } catch (error) { return {available: false}; }
    }, every: 300000, timeout: 12000});
    return {
      sync: function (visible) {
        if (!!visible === active) return;
        active = !!visible;
        if (!active) {lab.stop(); brew.stop(); return;}
        changed(state);
        lab.start(function (value) {state.lab = value; changed(state);});
        brew.start(function (value) {state.brew = value; changed(state);});
      }
    };
  }
  return {controller: controller};
})();
