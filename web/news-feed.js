/* Only completed Frank reports with current evidence; artwork is cached locally. */
var NewsFeed = (function () {
  'use strict';
  function items(config, at) {
    var feed = config && config.newsFeed, out = [], seen = {}, now = typeof at === 'number' ? at : Date.now();
    if (!feed || feed.source !== 'frank_investigator' || Object.prototype.toString.call(feed.items) !== '[object Array]') return out;
    for (var i = 0; i < feed.items.length && i < 100 && out.length < 6; i++) {
      var row = feed.items[i];
      if (!row || row.ready !== true || row.status !== 'completed' || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id) || typeof row.title !== 'string' || !row.title) continue;
      var host = /^https:\/\/([A-Za-z0-9.-]+)(?:\/|$)/.exec(row.sourceUrl || ''), analyzed = Date.parse(row.analyzedAt), published = row.publishedAt ? Date.parse(row.publishedAt) : null;
      if (!host || host[1].toLowerCase() !== row.source || !isFinite(analyzed) || analyzed > now + 300000 || now - analyzed > 172800000 || (published !== null && (!isFinite(published) || published > now + 300000 || now - published > 604800000)) || seen['$' + row.id]) continue;
      seen['$' + row.id] = true;
      var image = typeof row.image === 'string' && row.image.length <= 600000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/.test(row.image) ? row.image : '';
      out.push({id:row.id,title:row.title.slice(0,300),summary:typeof row.summary === 'string' ? row.summary.slice(0,1000) : '',source:row.source,publishedAt:published,analyzedAt:analyzed,image:image});
    }
    return out;
  }
  return {items:items};
})();
