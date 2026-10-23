/* Read-only webOSbrew update inventory. Packages are opened in Homebrew Channel for review. */
var BrewUpdates = (function () {
  'use strict';
  function version(value) {
    var m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value || '');
    return m ? [+m[1], +m[2], +m[3], m[4] || ''] : null;
  }
  function newer(remote, local) {
    var a = version(remote), b = version(local);
    if (!a || !b) return null;
    for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    if (!a[3] || !b[3]) return !a[3] && !!b[3];
    var aa = a[3].split('.'), bb = b[3].split('.');
    for (var j = 0; j < Math.max(aa.length, bb.length); j++) {
      if (aa[j] === bb[j]) continue;
      if (aa[j] === undefined) return false;
      if (bb[j] === undefined) return true;
      var an = /^\d+$/.test(aa[j]), bn = /^\d+$/.test(bb[j]);
      if (an !== bn) return !an;
      return an ? +aa[j] > +bb[j] : aa[j] > bb[j];
    }
    return false;
  }
  function compare(installedText, repository) {
    var installed;
    try { installed = JSON.parse(installedText); } catch (error) { return {available: false}; }
    if (Object.prototype.toString.call(installed) !== '[object Array]' || !repository || !repository.packages || !repository.paging || repository.paging.maxPage !== 1) return {available: false};
    var updates = [], checked = 0, seen = {};
    for (var i = 0; i < installed.length; i++) {
      var app = installed[i];
      if (!app || typeof app.id !== 'string' || seen[app.id]) continue;
      seen[app.id] = true;
      for (var j = 0; j < repository.packages.length; j++) {
        var p = repository.packages[j], m = p && p.manifest;
        if (!m || p.id !== app.id || m.id !== app.id) continue;
        var upgrade = newer(m.version, app.version);
        if (upgrade === null) continue;
        checked++;
        if (upgrade) updates.push({id: app.id, title: String(app.title || app.id).slice(0, 80), installed: app.version, latest: m.version});
        break;
      }
    }
    return {available: checked > 0, checked: checked, updates: updates};
  }
  function repository(done) {
    var x = new XMLHttpRequest(), finished = false;
    x.open('GET', 'https://repo.webosbrew.org/api/apps.json', true);
    x.timeout = 10000;
    function finish(body) { if (!finished) { finished = true; done(body); } }
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      try { finish(x.status === 200 ? JSON.parse(x.responseText) : null); } catch (error) { finish(null); }
    };
    x.onerror = x.ontimeout = function () { finish(null); };
    x.send();
    return function () { finished = true; x.abort(); };
  }
  function reader(readInstalled, readRepository, clock) {
    var cached = null, cachedAt = 0;
    clock = clock || Date.now;
    return function (done) {
      if (cached && clock() >= cachedAt && clock() - cachedAt < (cached.available ? 21600000 : 300000)) { done(JSON.stringify(cached)); return null; }
      var active = true, inventory, repo, haveInventory = false, haveRepo = false, cancels = [];
      function finish() {
        if (!active || !haveInventory || !haveRepo) return;
        active = false;
        cached = compare(inventory, repo); cachedAt = clock();
        done(JSON.stringify(cached));
      }
      try {
        cancels.push(readInstalled(function (text) { if (!active) return; inventory = text; haveInventory = true; finish(); }));
        cancels.push(readRepository(function (body) { if (!active) return; repo = body; haveRepo = true; finish(); }));
      } catch (error) {
        active = false; done(JSON.stringify({available: false}));
        for (var i = 0; i < cancels.length; i++) if (cancels[i]) cancels[i]();
      }
      return function () { active = false; for (var i = 0; i < cancels.length; i++) if (cancels[i]) cancels[i](); };
    };
  }
  return {newer: newer, compare: compare, reader: reader, repository: repository};
})();
