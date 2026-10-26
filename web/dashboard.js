/* The private dashboard's layout and remote focus order. No feed data or credentials here. */
var HomeDashboard = (function () {
  'use strict';
  var tabs = ['youtube', 'news', 'media', 'info'];
  function rows(tab, layout) {
    if (layout === 'cinema') {
      if (tab === 0) return [['youtube', 'media']];
      if (tab === 2) return [['media']];
    }
    if (tab === 0) return [['youtube', 'media'], ['news']];
    if (tab === 1) return [['news']];
    if (tab === 2) return [['media'], ['news']];
    return [];
  }
  function items(tab, layout) {
    var out = [], r = rows(tab, layout);
    for (var i = 0; i < r.length; i++) out = out.concat(r[i]);
    return out;
  }
  function next(tab, index, dx, dy, layout) {
    var r = rows(tab, layout), offset = 0;
    for (var y = 0; y < r.length; y++) {
      if (index >= offset && index < offset + r[y].length) {
        var x = index - offset;
        if (dx) return {zone: 'dashboard', index: offset + Math.max(0, Math.min(r[y].length - 1, x + dx))};
        if (dy < 0) return y === 0 ? {zone: 'top'} : {zone: 'dashboard', index: offset - r[y - 1].length};
        if (dy > 0) return y === r.length - 1 ? {zone: 'widgets'} : {zone: 'dashboard', index: offset + r[y].length};
        return {zone: 'dashboard', index: index};
      }
      offset += r[y].length;
    }
    return {zone: dy < 0 ? 'top' : 'widgets'};
  }
  function app(config, source) {
    var id = config && (source === 'youtube' ? config.youtubeApp : source === 'media' ? config.catalogApp : null);
    for (var i = 0; config && config.items && i < config.items.length; i++) if (config.items[i].id === id) return config.items[i];
    return null;
  }
  return {tabs: tabs, rows: rows, items: items, next: next, app: app};
})();
