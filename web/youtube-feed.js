/* Confirmed subscriptions only. Thumbnails stay local; live badges expire quickly. */
var YouTubeFeed = (function () {
  'use strict';
  function items(config) {
    var feed = config && config.youtubeFeed, found = false, out = [], seen = {}, now = Date.now();
    if (!feed || feed.source !== 'youtube_subscriptions' || feed.available !== true || feed.accountConfirmed !== true || feed.appId !== config.youtubeApp || Object.prototype.toString.call(feed.items) !== '[object Array]') return out;
    for (var a = 0; config.items && a < config.items.length; a++) if (config.items[a] && config.items[a].id === feed.appId) found = true;
    var at = Date.parse(feed.observedAt);
    if (!found || !isFinite(at) || at > now + 300000 || now - at > 172800000) return out;
    for (var i = 0; i < feed.items.length && i < 2048; i++) {
      var row = feed.items[i];
      if (!row || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(row.id) || typeof row.title !== 'string' || !row.title || row.watched === true || row.short === true || row.upcoming === true || seen['$'+row.id]) continue;
      seen['$'+row.id] = true;
      var image = typeof row.image === 'string' && row.image.length <= 600000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/.test(row.image) ? row.image : '';
      out.push({id:row.id,title:row.title.slice(0,300),channel:typeof row.channel === 'string' ? row.channel.slice(0,180) : '',duration:typeof row.duration === 'string' ? row.duration.slice(0,20) : '',publishedText:typeof row.publishedText === 'string' ? row.publishedText.slice(0,80) : '',image:image,live:row.live === true && now - at <= 900000,liveCaptured:row.live === true,rank:typeof row.rank === 'number' && isFinite(row.rank) ? row.rank : i,order:i});
    }
    out.sort(function (a,b) {return a.rank - b.rank || a.order - b.order;});
    return out.slice(0,24);
  }
  function target(config, index, selectedId) {
    var list = items(config);
    if (typeof index !== 'number' || index < 0 || index % 1 !== 0 || index >= list.length) return null;
    if (selectedId !== undefined && selectedId !== list[index].id) return null;
    // Cobalt's documented deep link stays on the TV surface, not the desktop watch page.
    var prefix = config.youtubeApp === 'com.cobalt.youtube.adfree' ? 'v=' : 'https://www.youtube.com/watch?v=';
    return {id:config.youtubeApp,params:{contentTarget:prefix+list[index].id}};
  }
  return {items:items,target:target};
})();
