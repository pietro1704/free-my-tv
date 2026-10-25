/* Read-only Nuvio snapshots. No credentials, provider promotions or cross-profile merging. */
var MediaCards = (function () {
  'use strict';
  function feed(config) {
    var value = config && config.mediaFeed, found = false;
    for (var i = 0; config && config.items && i < config.items.length; i++) if (config.items[i] && config.items[i].id === 'space.nuvio.webos') found = true;
    return found && config.catalogApp === 'space.nuvio.webos' && value && value.appId === config.catalogApp && Object.prototype.toString.call(value.items) === '[object Array]' ? value : null;
  }
  function image(value) {
    return typeof value === 'string' && /^https:\/\/(image\.tmdb\.org\/t\/p\/(w[0-9]+|original)|artworks\.thetvdb\.com\/banners)\/[A-Za-z0-9_\/-]+\.(jpg|jpeg|png|webp)$/.test(value) ? value : '';
  }
  function items(config) {
    var value = feed(config), out = [], seen = {};
    if (!value) return out;
    for (var i = 0; i < value.items.length && i < 2048; i++) {
      var row = value.items[i];
      if (!row || typeof row.id !== 'string' || !row.id || typeof row.title !== 'string' || !row.title || (row.kind !== 'movie' && row.kind !== 'series') || (row.section !== 'continue' && row.section !== 'library')) continue;
      var progress = typeof row.positionMs === 'number' && typeof row.durationMs === 'number' && row.durationMs > 0 ? Math.max(0, Math.min(100, Math.round(row.positionMs * 100 / row.durationMs))) : 0;
      if (row.section === 'continue' && (typeof row.positionMs !== 'number' || !isFinite(row.positionMs) || row.positionMs <= 0 || progress >= 95)) continue;
      out.push({id:row.id.slice(0,200), title:row.title.slice(0,180), kind:row.kind, image:image(row.image), section:row.section, progress:progress,
        updatedAt:typeof row.updatedAt === 'number' && isFinite(row.updatedAt) ? row.updatedAt : 0});
    }
    out.sort(function (a,b) {return a.section === b.section ? b.updatedAt - a.updatedAt : a.section === 'continue' ? -1 : 1;});
    var unique = [];
    for (var j = 0; j < out.length && unique.length < 24; j++) {
      var key = '$' + out[j].kind + ':' + out[j].id;
      if (!seen[key]) {seen[key] = true; unique.push(out[j]);}
    }
    return unique;
  }
  function observed(config) {
    var value = feed(config), at = value && value.observedAt;
    return typeof at === 'string' && isFinite(Date.parse(at)) ? at : '';
  }
  return {items:items, image:image, observed:observed};
})();
