/* Self-contained so the same read-only projection runs inside the Nuvio page. */
function snapshot(storage, observedAt) {
  function read(key, fallback) {try {return JSON.parse(storage.getItem(key)) || fallback;} catch (error) {return fallback;}}
  var active = read('activeProfileId', '1'), profile = typeof active === 'string' || typeof active === 'number' ? String(active) : '';
  var library = read('savedLibraryItems', []), progress = read('watchProgressItems', []), items = [], art = {};
  function own(row) {return row && String(row.profileId || '1') === profile;}
  function kind(row) {var value = row.contentType || row.type; return value === 'tv' ? 'series' : value;}
  function artUrl(value) {return typeof value === 'string' && /^https:\/\/(image\.tmdb\.org\/t\/p\/(w[0-9]+|original)|artworks\.thetvdb\.com\/banners)\/[A-Za-z0-9_\/-]+\.(jpg|jpeg|png|webp)$/.test(value) ? value : ''; }
  function identity(row) {return typeof row.contentId === 'string' ? row.contentId : '';}
  function row(value, section) {
    if (!own(value) || !identity(value) || (kind(value) !== 'movie' && kind(value) !== 'series')) return;
    var title = typeof value.title === 'string' ? value.title : '', key = '$' + kind(value) + ':' + identity(value);
    if (!title) return;
    var image = value.poster || value.posterUrl || art[key] || '';
    var output = {id:identity(value).slice(0,200),kind:kind(value),title:title.slice(0,180),section:section,
      image:artUrl(image),updatedAt:Number(value.updatedAt) || 0};
    if (section === 'continue') {
      var duration = Number(value.durationMs), position = Number(value.positionMs);
      if (!isFinite(duration) || !isFinite(position) || duration < 0 || position <= 0) return;
      if (duration > 86400000 && duration / 1000 <= 86400000) {duration /= 1000; position /= 1000;}
      if (duration > 0 && position > duration && position / 1000 <= duration) position /= 1000;
      if (duration > 0 && position / duration >= 0.95) return;
      output.positionMs = position; output.durationMs = duration;
    }
    items.push(output);
  }
  if (Object.prototype.toString.call(library) === '[object Array]') for (var i = 0; i < library.length && i < 1000; i++) {
    if (own(library[i])) art['$' + kind(library[i]) + ':' + identity(library[i])] = library[i].poster || library[i].posterUrl || '';
    row(library[i], 'library');
  }
  if (Object.prototype.toString.call(progress) === '[object Array]') for (var j = 0; j < progress.length && j < 5000; j++) row(progress[j], 'continue');
  return {appId:'space.nuvio.webos',observedAt:observedAt,items:items};
}
module.exports = snapshot;
