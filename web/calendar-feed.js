/* Bounded titles/times from the selected EventKit calendars; stale dates fail closed. */
var CalendarFeed = (function () {
  'use strict';
  function key(d) {return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);}
  function view(config, at) {
    config = config || {};
    var feed = config.calendarFeed, labels = config.labels || {}, out = {available:false, stale:false, rows:[], preview:[]};
    if (!feed || feed.source !== 'macos_eventkit' || feed.available !== true || feed.timeZone !== 'America/Sao_Paulo' || Object.prototype.toString.call(feed.events) !== '[object Array]') return out;
    var now = typeof at === 'number' ? at : Date.now(), today = new Date(now), tomorrow = new Date(now), end = new Date(now), generated = Date.parse(feed.generatedAt);
    today.setHours(0,0,0,0); tomorrow.setDate(today.getDate() + 1); tomorrow.setHours(0,0,0,0); end.setDate(today.getDate() + 2); end.setHours(0,0,0,0);
    if (feed.today !== key(today) || feed.tomorrow !== key(tomorrow) || !isFinite(generated) || generated > now + 300000 || now - generated > 172800000) {out.stale = true;return out;}
    var kinds = config.calendarKinds || ['primary','holiday'];
    if (Object.prototype.toString.call(kinds) !== '[object Array]') return out;
    var boundaries = [today.getTime(),tomorrow.getTime(),end.getTime()];
    for (var day = 0; day < 2; day++) {
      var rows = [], seen = {}, dayLabel = day ? labels.tomorrow || 'Amanhã' : labels.today || 'Hoje';
      for (var i = 0; i < feed.events.length && i < 500; i++) {
        var event = feed.events[i];
        if (!event || typeof event.id !== 'string' || !event.id || typeof event.title !== 'string' || !event.title || kinds.indexOf(event.kind) < 0) continue;
        var start = Date.parse(event.start), finish = Date.parse(event.end), id = '$' + event.id;
        if (!isFinite(start) || !isFinite(finish) || finish <= start || finish <= boundaries[day] || start >= boundaries[day + 1] || seen[id]) continue;
        seen[id] = true;
        var time = event.allDay === true ? labels.allDay || 'Dia todo' : start < boundaries[day] ? labels.continuing || 'Em andamento' : /^\d{2}:\d{2}$/.test(event.time) ? event.time : '—';
        rows.push({label:dayLabel + ' · ' + time, value:event.title.slice(0,300), at:Math.max(start,boundaries[day]), kind:event.kind});
      }
      rows.sort(function(a,b){return a.at-b.at;});
      if (!rows.length) rows.push({label:dayLabel,value:labels.noEvents || 'Sem eventos',kind:'empty'});
      var primary = null;
      for (var j = 0; j < rows.length; j++) if (rows[j].kind === 'primary') {primary = rows[j];break;}
      out.preview.push(primary || rows[0]); out.rows = out.rows.concat(rows);
    }
    out.available = true;return out;
  }
  return {view:view};
})();
