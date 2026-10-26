/* Edits are scoped to a confirmed snapshot; they never mutate provider data. */
var HomeArrangement = (function () {
  'use strict';
  function scope(config, source) {
    var feed = config[source === 'youtube' ? 'youtubeFeed' : 'mediaFeed'];
    var app = config[source === 'youtube' ? 'youtubeApp' : 'catalogApp'];
    if (!feed || feed.appId !== app || !feed.observedAt || (source === 'youtube' && (!feed.available || !feed.accountConfirmed))) return null;
    return JSON.stringify([source, app, feed.accountId || feed.profileId || '', feed.observedAt]);
  }
  function array(value) {return Object.prototype.toString.call(value) === '[object Array]' ? value : [];}
  function items(config, source, rows, state) {
    if (!state || state.scope !== scope(config, source)) return rows.slice();
    var out = [], order = array(state.order), hidden = array(state.hidden);
    for (var i = 0; i < order.length && i < 48; i++) for (var j = 0; j < rows.length; j++) {
      if (rows[j].id === order[i] && hidden.indexOf(rows[j].id) < 0 && out.indexOf(rows[j]) < 0) out.push(rows[j]);
    }
    for (var k = 0; k < rows.length; k++) if (hidden.indexOf(rows[k].id) < 0 && out.indexOf(rows[k]) < 0) out.push(rows[k]);
    return out;
  }
  function change(config, source, rows, previous, action, id) {
    var key = scope(config, source), ids = rows.map(function (row) {return row.id;});
    if (!key || (action !== 'reset' && ids.indexOf(id) < 0)) return null;
    var current = items(config, source, rows, previous).map(function (row) {return row.id;});
    var hidden = previous && previous.scope === key ? array(previous.hidden).filter(function (value) {return ids.indexOf(value) >= 0;}) : [];
    var at = current.indexOf(id);
    if (action === 'reset') return {scope:key, order:[], hidden:[]};
    if (action === 'hide') {if (hidden.indexOf(id) < 0) hidden.push(id);}
    else if (action === 'pin' || action === 'left' || action === 'right') {
      if (at < 0) return null;
      var to = action === 'pin' ? 0 : Math.max(0, Math.min(current.length - 1, at + (action === 'left' ? -1 : 1)));
      current.splice(at, 1); current.splice(to, 0, id);
    } else return null;
    return {scope:key, order:current.slice(0,48), hidden:hidden.slice(0,48)};
  }
  return {scope:scope, items:items, change:change};
})();
