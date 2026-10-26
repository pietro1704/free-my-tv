/*
 * The home screen for web-app TVs (LG webOS, Samsung Tizen), with the Android app's design and behavior (HomeView):
 *  - top: the "For You" title and the tabs (Explore, Movies, Shows); icon-only glass buttons at the right (Live TV,
 *    HDMI Inputs, Settings) and the crypto quotes at the end of the tab row;
 *  - three picks for this hour in the selected tab; the background is the first one's photo, blurred and almost white;
 *  - the glass shelf with the apps; ↓ opens the drawer (inputs, shortcuts, weather, prices); ↑ or Back closes it;
 *  - a night look from sunset to sunrise; a screensaver after a few idle minutes.
 * The remote's arrows, OK and Back move the focus; a pointer (LG's Magic Remote) focuses what it points at.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function sym(name, parent, size) {
    var s = el('span', 'sym', parent);
    s.style.webkitMaskImage = 'url(symbols/' + name + '.png)';
    s.style.maskImage = 'url(symbols/' + name + '.png)';
    if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
    return s;
  }

  function coin(i, parent) {
    if (HomeProfile.config.forex && i >= 3) {
      el('span', 'currency-mark', parent, i === 3 ? '$' : '€');
      return;
    }
    var c = window.COINS && window.COINS[i];
    if (!c) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    for (var k = 0; k < c.length; k++) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', c[k]);
      p.setAttribute('fill-rule', 'evenodd');
      svg.appendChild(p);
    }
    parent.appendChild(svg);
  }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function setClass(e, c, on) {
    if (!e) return;
    if (on && !hasClass(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && hasClass(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var stage = $('stage'), body = document.body;

  /** The 1920 × 1080 stage fills the window (on the TV it already is 1920 × 1080). */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // MARK: - Apps on the shelf

  /** Shelf apps in this order when installed, like the Android app: key, LG app id, name on the TV, brand gradient. */
  var SHELF = [
    ['netflix', /^netflix$/, /netflix/i, ['#0A0A0A', '#000000']],
    ['youtube', /youtube/, /^youtube$/i, ['#1C1C1E', '#09090A']],
    ['prime', /^amazon$/, /prime video|amazon/i, ['#2AA8FF', '#0A68D4']],
    ['disney', /disney/, /disney/i, ['#173584', '#08143F']],
    ['max', /hbo|wbd/, /^(hbo )?max$|hbo max/i, ['#5C30E8', '#221684']],
    ['appletv', /appletv|apple\.tv/, /apple tv/i, ['#1C1C1E', '#000000']],
    ['hulu', /^hulu/, /hulu/i, ['#1CE783', '#0B8F4E']],
    ['paramount', /paramount|cbs/, /paramount/i, ['#0064FF', '#002A86']],
    ['peacock', /peacock/, /peacock/i, ['#1C1C1E', '#000000']],
    ['nfl', /nfl/, /^nfl/i, ['#013369', '#00163D']],
    ['globoplay', /globoplay/, /globoplay/i, ['#FF8A1F', '#FF2D5A']],
    ['jellyfin', /jellyfin/i, /jellyfin/i, ['#AA5CC3', '#00A4DC']],
    ['spotify', /spotify/, /spotify/i, ['#1DB954', '#0F7A36']]
  ];
  var MAX_SHELF = 8;

  function shelfKey(app) {
    for (var i = 0; i < SHELF.length; i++) if (SHELF[i][1].test(app.id) || SHELF[i][2].test(app.title)) return SHELF[i];
    return null;
  }

  function darken(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#161618';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  }

  /** A name that fits the tile on one line (the font shrinks for long names). */
  function wordFit(title, width, max) {
    return Math.max(18, Math.min(max, Math.floor(width * 0.8 / (Math.max(4, title.length) * 0.56))));
  }

  /** An app's face: its own icon on its brand color (or its name, when the icon can't be read). */
  function face(app, box, wordSize) {
    var k = shelfKey(app);
    var top = k ? k[3][0] : app.color ? darken(app.color, 0.92) : '#2A2A2E';
    var bottom = k ? k[3][1] : app.color ? darken(app.color, 0.62) : '#161618';
    box.style.background = '-webkit-linear-gradient(top, ' + top + ', ' + bottom + ')';
    box.style.background = 'linear-gradient(' + top + ', ' + bottom + ')';
    var word = el('div', 'word', box, app.title);
    if (wordSize) word.style.fontSize = wordSize + 'px';
    if (app.icon) {
      var img = el('img', '', box);
      word.style.visibility = 'hidden';
      img.onerror = function () { img.parentNode.removeChild(img); word.style.visibility = ''; };
      img.src = app.icon;
    }
  }

  var apps = [], shelf = [], others = [], inputs = [];

  function pickShelf() {
    if (HomeProfile.enabled) {
      shelf = HomeProfile.shelf(apps, inputs);
      others = [];
      return;
    }
    var chosen = Prefs.shelf(), out = [];
    if (chosen) {
      for (var i = 0; i < chosen.length && out.length < MAX_SHELF; i++) {
        for (var j = 0; j < apps.length; j++) if (apps[j].id === chosen[i]) out.push(apps[j]);
      }
    } else {
      for (var s = 0; s < SHELF.length && out.length < MAX_SHELF; s++) {
        for (var a = 0; a < apps.length; a++) {
          if ((SHELF[s][1].test(apps[a].id) || SHELF[s][2].test(apps[a].title)) && out.indexOf(apps[a]) < 0) { out.push(apps[a]); break; }
        }
      }
      if (!out.length) out = apps.slice(0, MAX_SHELF);
    }
    shelf = out;
    others = apps.filter(function (x) { return shelf.indexOf(x) < 0; });
  }

  // MARK: - Focus

  var dashboardOn = !!HomeProfile.config.dashboard;
  function tabCount() {return dashboardOn ? 4 : 3;}
  function topButtonCount() {return dashboardOn ? 1 : 3;}
  var dashboardNodes = {}, mediaItems = [], mediaTrack = null, newsItems = [], videoItems = [], videoTrack = null;
  var mediaSnapshot = null, videoSnapshot = null, pointerX = null, pointerY = null;
  var newsTrack = null, newsReportState = null;
  var Z = {REPORT:'report', DASHBOARD: 'dashboard', TOP: 'top', WIDGETS: 'widgets', CARDS: 'cards', SHELF: 'shelf', DRAWER: 'drawer', APPS: 'apps', SETTINGS: 'settings', EDIT: 'edit', LANG: 'lang'};
  var st = {zone: Z.SHELF, top: 0, tab: 0, card: 0, dashboard: 0, media: 0, news: 0, video: 0, widget: 0, shelf: 0, drawer: 0, grid: 0, row: 0, edit: 0, lang: 0};
  var cards = [];
  var featurePreview = HomeHero.create($('feature-preview'));
  var dashboardScroll = null, dashboardStack = null, dashboardScrollTab = -1;
  var artworkPress = false, artworkRefreshPending = false, artworkPressTimer = 0;

  function releaseArtworkPress() {
    if (!artworkPress) return;
    artworkPress = false;
    clearTimeout(artworkPressTimer);
    if (artworkRefreshPending) {
      artworkRefreshPending = false;
      // Mouseup is followed by click in the same task; retain its original target until then.
      setTimeout(function () {if (!document.hidden) renderDashboard();}, 0);
    }
  }

  function beginArtworkPress(event) {
    if (!dashboardOn || event.button !== 0 || saverOn || sheetOpen()) return;
    var node = event.target;
    while (node && node !== $('dashboard')) {
      if (hasClass(node, 'video-card') || hasClass(node, 'media-card') || hasClass(node, 'news-card')) {
        artworkPress = true;
        clearTimeout(artworkPressTimer);
        artworkPressTimer = setTimeout(releaseArtworkPress, 5000);
        return;
      }
      node = node.parentNode;
    }
  }

  function initDashboardScroll() {
    if (!dashboardOn) return;
    dashboardScroll = el('div', '', $('top')); dashboardScroll.id = 'dashboard-scroll';
    dashboardStack = el('div', '', dashboardScroll); dashboardStack.id = 'dashboard-stack';
    dashboardStack.appendChild($('dashboard'));
    dashboardStack.appendChild($('home-widgets'));
  }

  function scrollDashboardFocus() {
    if (!dashboardScroll) return;
    var content = $('dashboard'), widgets = $('home-widgets');
    var bottom = content.offsetTop + content.offsetHeight;
    if (widgetsOn) bottom = Math.max(bottom, widgets.offsetTop + widgets.offsetHeight);
    var height = (bottom + 12) + 'px';
    if (dashboardStack.style.height !== height) dashboardStack.style.height = height;
    if (dashboardScrollTab !== st.tab || st.zone === Z.TOP) dashboardScroll.scrollTop = 0;
    dashboardScrollTab = st.tab;
    var target = st.zone === Z.WIDGETS ? widgets.children[st.widget] : st.zone === Z.DASHBOARD ? dashboardNodes[HomeDashboard.items(st.tab)[st.dashboard]] : null;
    if (!target || target.offsetHeight === 0) return;
    var viewport = dashboardScroll.getBoundingClientRect(), rect = target.getBoundingClientRect();
    var scale = viewport.height / dashboardScroll.clientHeight;
    if (!isFinite(scale) || scale <= 0) return;
    if (rect.bottom > viewport.bottom) dashboardScroll.scrollTop += Math.ceil((rect.bottom - viewport.bottom) / scale) + 8;
    else if (rect.top < viewport.top) dashboardScroll.scrollTop -= Math.ceil((viewport.top - rect.top) / scale) + 8;
  }

  function sheetOpen() { return st.zone === Z.REPORT || st.zone === Z.APPS || st.zone === Z.SETTINGS || st.zone === Z.EDIT || st.zone === Z.LANG; }

  function updateFocus() {
    var i, list;
    list = $('tabs').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.tab);
      setClass(list[i], 'focus', st.zone === Z.TOP && st.top === i);
    }
    list = $('buttons').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.TOP && st.top === tabCount() + i);
    setClass($('quotes'), 'hide', st.zone === Z.TOP && st.top >= tabCount());
    list = $('cards').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.CARDS && st.card === i);
    var dashboardItems = HomeDashboard.items(st.tab);
    for (var key in dashboardNodes) if (dashboardNodes.hasOwnProperty(key)) setClass(dashboardNodes[key], 'focus', st.zone === Z.DASHBOARD && dashboardItems[st.dashboard] === key);
    focusMedia();
    focusVideos();
    focusNews();
    renderFocusDetails();
    renderFeaturePreview();
    list = $('home-widgets').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.WIDGETS && st.widget === i);
    list = $('tiles').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.SHELF && st.shelf === i);
    list = document.querySelectorAll('#drawer .key');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.DRAWER && st.drawer === i);
    list = document.querySelectorAll('#apps .cell');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.APPS && st.grid === i);
    var rows = Math.max(1, Math.ceil(others.length / 5)), r = Math.floor(st.grid / 5), first = Math.max(0, Math.min(rows - 3, r - 1));
    $('apps').lastChild.style.webkitTransform = $('apps').lastChild.style.transform = 'translateY(' + (-first * 239) + 'px)';
    focusRows($('settings'), st.row, st.zone === Z.SETTINGS);
    focusRows($('shelfedit'), st.edit, st.zone === Z.EDIT);
    focusRows($('langpick'), st.lang, st.zone === Z.LANG);
    if (langHint) langHint.textContent = (st.lang + 1) + ' / ' + languageChoices().length + '  ·  ' + tr('OK picks, Back cancels.');
    setClass(body, 'drawer-open', st.zone === Z.DRAWER);
    scrollDashboardFocus();
    syncHomeWidgets();
  }

  function focusRows(sheet, index, on) {
    var rows = sheet.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) setClass(rows[i], 'focus', on && i === index);
    var holder = sheet.querySelector('.rows');
    if (!holder) return;
    var visible = 7, first = Math.max(0, Math.min(rows.length - visible, index - 3));
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-first * 78) + 'px)';
  }

  function nearest(nodes, x) {
    var best = 0, bestD = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function centerX(node) {
    if (!node) return 960;
    var r = node.getBoundingClientRect();
    return (r.left + r.right) / 2;
  }

  // MARK: - Top: title, tabs, buttons, quotes

  var TAB_KIND = [null, 'movie', 'tv'];

  function renderTop() {
    $('title').textContent = tr('For You');
    var tabs = $('tabs');
    tabs.innerHTML = '';
    var names = dashboardOn ? [HomeProfile.labels.youtubeTab || 'YouTube', HomeProfile.labels.newsTab || 'News', HomeProfile.labels.mediaTab || 'Media', HomeProfile.labels.infoTab || 'Info'] : [tr('Explore'), tr('Movies'), tr('Shows')];
    for (var i = 0; i < names.length; i++) {
      var t = el('button', 'tab', tabs, names[i]);
      hover(t, Z.TOP, i);
    }
    var buttons = $('buttons');
    buttons.innerHTML = '';
    var defs = [['live_tv', tr('light|Live TV')], ['hdmi', tr('HDMI Inputs')], ['settings', tr('light|Settings')]];
    if (HomeProfile.enabled) defs[0] = ['settings', HomeProfile.labels.diagnostics || 'CPU / RAM / Hz'];
    if (dashboardOn) defs = [['settings', tr('light|Settings')]];
    for (var b = 0; b < defs.length; b++) {
      var r = el('button', 'round' + (b === defs.length - 1 ? ' last' : ''), buttons);
      r.style.left = (dashboardOn ? 1784 : 1596 + 88 * b) + 'px';
      r.setAttribute('aria-label', defs[b][1]);
      sym(defs[b][0], r);
      el('div', 'tip', r, defs[b][1]);
      hover(r, Z.TOP, tabCount() + b);
    }
  }

  function renderQuotes() {
    var q = $('quotes'), coins = Data.activeCoins();
    q.innerHTML = '';
    for (var i = 0; i < coins.length; i++) {
      var item = el('span', 'q', q);
      coin(coins[i], item);
      el('span', '', item, Data.compact(Data.prices[coins[i]]));
    }
  }

  // MARK: - Picks and background

  function renderCards() {
    if (dashboardOn) {renderDashboard(); return;}
    var list = Data.picks(TAB_KIND[st.tab]);
    var holder = $('cards');
    setClass(body, 'no-picks', !list.length);
    var same = list.length === cards.length;
    for (var i = 0; same && i < list.length; i++) same = list[i].id === cards[i].id && list[i].backdrop === cards[i].backdrop && list[i].meta === cards[i].meta;
    if (same && holder.children.length === list.length) return;
    cards = list;
    holder.innerHTML = '';
    var rects = [[80, 1040], [1160, 320], [1520, 320]];
    for (var c = 0; c < list.length; c++) {
      var p = list[c], card = el('div', 'card', holder);
      card.style.left = rects[c][0] + 'px';
      card.style.width = rects[c][1] + 'px';
      var img = el('div', 'img', card);
      img.style.backgroundImage = 'url(' + Data.image(p.backdrop, c === 0 ? 'w1280' : 'w780') + ')';
      el('div', 'name', card, p.title);
      if (c === 0 && p.meta) el('div', 'meta', card, p.meta);
      hover(card, Z.CARDS, c);
    }
    st.card = Math.min(st.card, Math.max(0, list.length - 1));
    if (!list.length && st.zone === Z.CARDS) st.zone = Z.SHELF;
    backdrop(list.length ? Data.image(list[0].backdrop, 'w300') : '');
    updateFocus();
  }

  function artworkSnapshot(feed) {
    return feed && Object.prototype.toString.call(feed.items) === '[object Array]' ? {feed:feed,rows:feed.items,count:feed.items.length,observedAt:feed.observedAt} : null;
  }

  function retainedArtworkIndex(items, previous, index) {
    for (var i = 0; previous && i < items.length; i++) if (items[i].id === previous.id && items[i].kind === previous.kind) return i;
    return Math.max(0, Math.min(items.length - 1, index));
  }

  function focusedArtwork() {
    if (!dashboardOn || st.zone !== Z.DASHBOARD || saverOn || document.hidden) return null;
    var source = HomeDashboard.items(st.tab)[st.dashboard], config = HomeProfile.config;
    if (source !== 'youtube' && source !== 'media') return null;
    var feed = source === 'youtube' ? config.youtubeFeed : config.mediaFeed, snapshot = source === 'youtube' ? videoSnapshot : mediaSnapshot;
    if (!feed || !snapshot || snapshot.feed !== feed || snapshot.rows !== feed.items || snapshot.count !== feed.items.length || snapshot.observedAt !== feed.observedAt || !HomeDashboard.app(config, source)) return null;
    if (source === 'youtube') {
      var at = Date.parse(feed.observedAt), now = Date.now();
      if (feed.source !== 'youtube_subscriptions' || feed.available !== true || feed.accountConfirmed !== true || feed.appId !== config.youtubeApp || !isFinite(at) || at > now + 300000 || now - at > 172800000) return null;
    } else if (config.catalogApp !== 'space.nuvio.webos' || feed.appId !== config.catalogApp) return null;
    var item = source === 'youtube' ? videoItems[st.video] : mediaItems[st.media];
    return item ? {source:source,item:item} : null;
  }

  function renderFocusDetails() {
    var selected = focusedArtwork(), holder = $('focus-details'), labels = HomeProfile.labels, parts = [];
    if (!holder) {setClass(body, 'focus-details-on', false);return;}
    setClass(body, 'focus-details-on', !!selected);
    if (!selected) {holder.firstChild.textContent = '';holder.lastChild.textContent = '';return;}
    var item = selected.item;
    if (selected.source === 'youtube') {
      if (item.channel) parts.push(item.channel);
      if (item.live) parts.push(labels.youtubeLive || 'Ao vivo');
      else if (item.liveCaptured) parts.push(labels.youtubeLiveCaptured || 'Live na captura');
      else if (item.duration) parts.push(item.duration);
      if (item.publishedText) parts.push((labels.youtubeCaptured || 'Na captura') + ': ' + item.publishedText);
    } else {
      parts.push(item.section === 'continue' ? labels.continueWatching || 'Continue watching' : labels.myList || 'My list');
      if (item.season !== undefined && item.episode !== undefined) parts.push('T' + item.season + ' · E' + item.episode);
      if (item.progress !== null) parts.push(item.progress + '%');
      if (item.episodeTitle) parts.push(item.episodeTitle);
    }
    if (holder.firstChild.textContent !== item.title) holder.firstChild.textContent = item.title;
    var meta = parts.join(' · ');
    setClass(holder, 'long-details', item.title.length > 180 || meta.length > 200);
    if (holder.lastChild.textContent !== meta) holder.lastChild.textContent = meta;
  }

  function renderFeaturePreview() {
    var enabled = dashboardOn && ((st.tab === 0 && videoItems.length > 0) || (st.tab === 2 && mediaItems.length > 0));
    setClass(body, 'preview-layout', enabled);
    if (!enabled || document.hidden || saverOn || sheetOpen() || st.zone === Z.DRAWER) {featurePreview.update(null);return;}
    var selected = focusedArtwork(), item = selected && selected.item;
    if (!item && (st.zone === Z.TOP || st.zone === Z.SHELF)) {
      var list = st.tab === 0 ? YouTubeFeed.items(HomeProfile.config) : MediaCards.items(HomeProfile.config);
      item = list[0];
    }
    featurePreview.update(item ? {id:item.id,title:item.title,meta:item.channel || item.episodeTitle || '',image:item.background || item.image} : null);
  }

  function pointerMoved(event) {
    if (event.clientX === pointerX && event.clientY === pointerY) return false;
    pointerX = event.clientX; pointerY = event.clientY; return true;
  }

  function artworkHover(card, source, index) {
    card.onmousemove = function (event) {
      if (!pointerMoved(event) || saverOn || sheetOpen() || st.zone === Z.DRAWER || HomeDashboard.items(st.tab).indexOf(source) < 0) return;
      if (source === 'youtube') st.video = index; else st.media = index;
      st.zone = Z.DASHBOARD; st.dashboard = HomeDashboard.items(st.tab).indexOf(source); updateFocus();
    };
  }

  function focusMedia() {
    if (!mediaTrack) return;
    var nodes = mediaTrack.children, width = st.tab === 2 ? 9 : 2, step = st.tab === 2 ? 184 : 270;
    st.media = Math.max(0, Math.min(mediaItems.length - 1, st.media));
    var first = Math.max(0, st.media - width + 1);
    var selected = focusedArtwork();
    for (var i = 0; i < nodes.length; i++) {
      setClass(nodes[i], 'selected', !!selected && selected.source === 'media' && i === st.media);
      var image = nodes[i].querySelector('img');
      if (image && !image.getAttribute('src') && i >= first && i <= first + width && HomeDashboard.items(st.tab).indexOf('media') >= 0) image.src = image.getAttribute('data-src');
    }
    mediaTrack.style.webkitTransform = mediaTrack.style.transform = 'translateX(' + (-first * step) + 'px)';
  }

  function renderMedia() {
    var panel = dashboardNodes.media, old = panel.querySelector('.media-viewport');
    if (old) panel.removeChild(old);
    var stamp = panel.querySelector('.media-stamp');
    if (stamp) panel.removeChild(stamp);
    var previous = mediaItems[st.media];
    mediaTrack = null; mediaItems = MediaCards.items(HomeProfile.config);
    st.media = retainedArtworkIndex(mediaItems, previous, st.media);
    var feed = HomeProfile.config.mediaFeed;
    mediaSnapshot = artworkSnapshot(feed);
    setClass(panel, 'has-media', mediaItems.length > 0);
    setClass(body, 'media-artwork', mediaItems.length > 0 && (st.tab === 0 || st.tab === 2));
    if (!mediaItems.length) return;
    var viewport = el('div', 'media-viewport', panel);
    mediaTrack = el('div', 'media-track', viewport);
    for (var i = 0; i < mediaItems.length; i++) {
      var item = mediaItems[i], card = el('div', 'media-card', mediaTrack);
      artworkHover(card, 'media', i);
      card.style.left = (i * (st.tab === 2 ? 184 : 270)) + 'px';
      var artwork = el('div', 'media-art', card), source = st.tab === 2 ? item.image || item.background : item.background || item.image;
      setClass(artwork, 'poster-fallback', st.tab !== 2 && !item.background);
      if (source) {
        var image = el('img', '', artwork); image.alt = ''; image.setAttribute('referrerpolicy', 'no-referrer');
        image.onerror = function () {setClass(this, 'failed', true);}; image.setAttribute('data-src', source);
      }
      el('div', 'media-shade', artwork);
      el('div', 'media-name', card, item.title);
      el('div', 'media-section', artwork, item.section === 'continue' ? HomeProfile.labels.continueWatching || 'Continue watching' : HomeProfile.labels.myList || 'My list');
      var details = [];
      if (item.season !== undefined && item.episode !== undefined) details.push('T' + item.season + ' · E' + item.episode);
      if (item.progress !== null) details.push(item.progress + '%');
      el('div', 'media-detail', card, details.join(' · '));
      if (item.episodeTitle) el('div', 'media-episode', card, item.episodeTitle);
      card.setAttribute('aria-label', item.title + (details.length ? ' · ' + details.join(' · ') : '') + (item.episodeTitle ? ' · ' + item.episodeTitle : ''));
      if (item.progress !== null) {var bar = el('div', 'media-progress', card); bar.style.width = item.progress + '%';}
      card.onclick = (function (index) {return function (event) {
        event.stopPropagation();
        if (sheetOpen() || st.zone === Z.DRAWER || HomeDashboard.items(st.tab).indexOf('media') < 0) return;
        st.media = index; st.zone = Z.DASHBOARD; st.dashboard = HomeDashboard.items(st.tab).indexOf('media'); updateFocus(); activate();
      };})(i);
    }
    var at = MediaCards.observed(HomeProfile.config);
    if (at) el('div', 'media-stamp', panel, (HomeProfile.labels.synced || 'Synced') + ' ' + new Date(at).toLocaleString(I18N.locale()));
  }

  function focusVideos() {
    if (!videoTrack) return;
    st.video = Math.max(0, Math.min(videoItems.length - 1, st.video));
    var first = Math.max(0, st.video - 2);
    var selected = focusedArtwork();
    for (var i = 0; i < videoTrack.children.length; i++) {
      var card = videoTrack.children[i], image = card.querySelector('img');
      setClass(card, 'selected', !!selected && selected.source === 'youtube' && i === st.video);
      if (image && !image.getAttribute('src') && i >= first && i < first + 4 && HomeDashboard.items(st.tab).indexOf('youtube') >= 0) image.src = image.getAttribute('data-src');
    }
    videoTrack.style.webkitTransform = videoTrack.style.transform = 'translateX(' + (-first * 372) + 'px)';
  }

  function renderVideos() {
    var panel = dashboardNodes.youtube, old = panel.querySelector('.video-viewport');
    if (old) panel.removeChild(old);
    var stamp = panel.querySelector('.video-stamp');
    if (stamp) panel.removeChild(stamp);
    var previous = videoItems[st.video];
    videoTrack = null; videoItems = YouTubeFeed.items(HomeProfile.config);
    st.video = retainedArtworkIndex(videoItems, previous, st.video);
    var feed = HomeProfile.config.youtubeFeed;
    videoSnapshot = artworkSnapshot(feed);
    setClass(panel, 'has-videos', videoItems.length > 0);
    setClass(body, 'youtube-artwork', st.tab === 0 && videoItems.length > 0);
    if (!videoItems.length) {
      panel.querySelector('.dashboard-subtitle').textContent = HomeProfile.config.youtubeFeed ? HomeProfile.labels.youtubeRefresh || 'Inscrições aguardando atualização' : HomeProfile.labels.youtubePending || 'Subscriptions not connected';
      return;
    }
    var viewport = el('div', 'video-viewport', panel);
    videoTrack = el('div', 'video-track', viewport);
    for (var i = 0; i < videoItems.length; i++) {
      var item = videoItems[i], card = el('div', 'video-card', videoTrack);
      artworkHover(card, 'youtube', i);
      card.style.left = (i * 372) + 'px';
      var artwork = el('div', 'video-art', card);
      if (item.image) {
        var image = el('img', '', artwork); image.alt = ''; image.setAttribute('data-src', item.image);
        image.onerror = function () {setClass(this, 'failed', true);};
      }
      el('div', 'video-name', card, item.title);
      el('div', 'video-channel', card, item.channel);
      el('div', 'video-duration', artwork, item.live ? HomeProfile.labels.youtubeLive || 'Ao vivo' : item.liveCaptured ? HomeProfile.labels.youtubeLiveCaptured || 'Live na captura' : item.duration);
      card.onclick = (function (index) {return function (event) {
        event.stopPropagation();
        if (sheetOpen() || st.zone === Z.DRAWER || HomeDashboard.items(st.tab).indexOf('youtube') < 0) return;
        st.video = index; st.zone = Z.DASHBOARD; st.dashboard = HomeDashboard.items(st.tab).indexOf('youtube'); updateFocus(); activate();
      };})(i);
    }
    el('div', 'video-stamp', panel, (HomeProfile.labels.synced || 'Synced') + ' ' + new Date(HomeProfile.config.youtubeFeed.observedAt).toLocaleString(I18N.locale()));
  }

  function newsDate(at) {
    var d = new Date(at);function two(n){return ('0'+n).slice(-2);}
    return two(d.getDate())+'/'+two(d.getMonth()+1)+'/'+d.getFullYear()+' '+two(d.getHours())+':'+two(d.getMinutes());
  }

  function newsPublication(item) {
    return item.publishedAt === null ? HomeProfile.labels.newsPublicationUnknown || 'Publicação não informada' : (HomeProfile.labels.newsPublished || 'Publicação')+' '+newsDate(item.publishedAt);
  }

  function focusNews() {
    if (!newsTrack) return;
    var visible=st.tab===1?4:3,step=st.tab===1?424:584;
    st.news=Math.max(0,Math.min(newsItems.length-1,st.news));
    var first=Math.max(0,st.news-visible+1),show=HomeDashboard.items(st.tab).indexOf('news')>=0;
    for(var i=0;i<newsTrack.children.length;i++){
      var card=newsTrack.children[i],image=card.querySelector('img');
      setClass(card,'selected',show&&st.zone===Z.DASHBOARD&&HomeDashboard.items(st.tab)[st.dashboard]==='news'&&i===st.news);
      if(image&&!image.getAttribute('src')&&show&&i>=first&&i<=first+visible)image.src=image.getAttribute('data-src');
    }
    newsTrack.style.webkitTransform=newsTrack.style.transform='translateX('+(-first*step)+'px)';
  }

  function dismissNewsReport() {
    newsReportState=null;var holder=$('news-report');if(holder){setClass(holder,'open',false);holder.textContent='';}
  }

  function closeNewsReport() {
    dismissNewsReport();st.zone=Z.DASHBOARD;st.dashboard=Math.max(0,HomeDashboard.items(st.tab).indexOf('news'));updateFocus();
  }

  function openNewsReport() {
    var selected=newsItems[st.news],fresh=NewsFeed.items(HomeProfile.config),item=null;
    for(var i=0;selected&&i<fresh.length;i++)if(fresh[i].id===selected.id)item=fresh[i];
    if(!item){renderNews();updateFocus();return;}
    var holder=$('news-report');if(!holder)return;holder.textContent='';
    var box=el('div','report-box',holder),body=el('div','report-scroll',box),report=item.report;
    body.addEventListener('wheel',poke);
    el('div','report-headline',body,item.title);
    el('div','report-meta',body,item.source+' · '+newsPublication(item)+'\n'+(HomeProfile.labels.newsAnalyzed||'Análise')+' '+newsDate(item.analyzedAt)+' · Frank Investigator');
    el('div','report-source',body,item.sourceUrl);
    function section(title,text){if(!text)return;el('div','report-heading',body,title);el('div','report-text',body,text);}
    if(report){
      el('div','report-meta',body,report.reused?'Relatório reaproveitado do Frank Investigator':'Relatório salvo do Frank Investigator');
      if(report.degraded)el('div','report-warning',body,'Análise com limitações');
      section('Conclusão do Frank',report.conclusion||item.summary);
      section('Pontos fortes',report.strengths.join('\n• ').replace(/^(.+)/,'• $1'));
      section('Ressalvas',report.weaknesses.join('\n• ').replace(/^(.+)/,'• $1'));
      section('Avaliação geral',report.quality);
      var labels={pending:'Pendente',supported:'Com suporte',disputed:'Contestado',mixed:'Misto',needs_more_evidence:'Precisa de mais evidências',not_checkable:'Não verificável'},lines=[];
      for(var code in labels)if(labels.hasOwnProperty(code)&&report.verdicts[code])lines.push(labels[code]+' ('+code+'): '+report.verdicts[code]);
      section('Classificações do Frank',lines.join('\n'));
    }else section('Resumo salvo do Frank',item.summary||'Resumo indisponível');
    el('div','report-hint',box,'↑ ↓ · Rolar');
    var close=el('button','report-close',box,'Voltar');close.onclick=closeNewsReport;
    newsReportState={id:item.id,analyzedAt:item.analyzedAt};st.zone=Z.REPORT;setClass(holder,'open',true);updateFocus();
  }

  function renderNews() {
    var panel=dashboardNodes.news,old=panel.querySelector('.news-viewport'),labels=HomeProfile.labels,previous=newsItems[st.news];
    if(old)panel.removeChild(old);
    newsTrack=null;newsItems=NewsFeed.items(HomeProfile.config);st.news=retainedArtworkIndex(newsItems,previous,st.news);
    if(newsReportState){
      var current=false;for(var n=0;n<newsItems.length;n++)if(newsItems[n].id===newsReportState.id&&newsItems[n].analyzedAt===newsReportState.analyzedAt)current=true;
      if(!current){dismissNewsReport();if(st.zone===Z.REPORT){st.zone=Z.DASHBOARD;st.dashboard=Math.max(0,HomeDashboard.items(st.tab).indexOf('news'));}}
    }
    setClass(panel,'has-news',newsItems.length>0);
    if(!newsItems.length){panel.querySelector('.dashboard-subtitle').textContent=HomeProfile.config.newsFeed?labels.newsRefresh||'Relatórios aguardando atualização':labels.newsPending||'News not connected';return;}
    var viewport=el('div','news-viewport',panel);newsTrack=el('div','news-track',viewport);
    for(var i=0;i<newsItems.length;i++){
      var item=newsItems[i],card=el('div','news-card',newsTrack);card.style.left=(i*(st.tab===1?424:584))+'px';
      setClass(card,'no-image',!item.image);card.setAttribute('aria-label',item.title+' · '+item.source);
      if(item.image){var image=el('img','news-image',card);image.alt='';image.setAttribute('data-src',item.image);image.onerror=function(){setClass(this.parentNode,'no-image',true);setClass(this,'failed',true);};}
      el('div','news-headline',card,item.title);el('div','news-meta',card,item.source+' · '+newsPublication(item));
      card.onmousemove=(function(index){return function(event){if(!pointerMoved(event)||saverOn||sheetOpen()||st.zone===Z.DRAWER||HomeDashboard.items(st.tab).indexOf('news')<0)return;st.news=index;st.zone=Z.DASHBOARD;st.dashboard=HomeDashboard.items(st.tab).indexOf('news');updateFocus();};})(i);
      card.onclick=(function(index){return function(event){event.stopPropagation();if(saverOn||sheetOpen()||st.zone===Z.DRAWER||HomeDashboard.items(st.tab).indexOf('news')<0)return;st.news=index;st.zone=Z.DASHBOARD;st.dashboard=HomeDashboard.items(st.tab).indexOf('news');activate();};})(i);
    }
  }

  function renderDashboard() {
    if (artworkPress) {artworkRefreshPending = true; return;}
    var holder = $('dashboard'), labels = HomeProfile.labels;
    if (!dashboardNodes.youtube) {
      var sources = ['youtube', 'media', 'news'];
      for (var i = 0; i < sources.length; i++) {
        var source = sources[i], panel = el('button', 'dashboard-panel dashboard-' + source, holder);
        panel.setAttribute('data-panel', source);
        dashboardNodes[source] = panel;
        var app = HomeDashboard.app(HomeProfile.config, source);
        if (app && app.icon) {var icon = el('img', 'dashboard-icon', panel); icon.src = app.icon; icon.alt = '';}
        el('div', 'dashboard-title', panel, source === 'youtube' ? labels.youtubeTab || 'YouTube' : source === 'media' ? 'Nuvio' : labels.newsTab || 'News');
        el('div', 'dashboard-subtitle', panel, source === 'youtube' ? labels.youtubePending || 'Subscriptions not connected' : source === 'media' ? labels.mediaPending || 'Open your library in Nuvio' : labels.newsPending || 'News not connected');
        panel.onclick = (function (key) {return function () {
          if (sheetOpen() || st.zone === Z.DRAWER || HomeDashboard.items(st.tab).indexOf(key) < 0) return;
          st.zone = Z.DASHBOARD; st.dashboard = HomeDashboard.items(st.tab).indexOf(key); activate();
        };})(source);
        panel.onmousemove = (function (key) {return function (event) {
          if (!pointerMoved(event) || saverOn || sheetOpen() || st.zone === Z.DRAWER || HomeDashboard.items(st.tab).indexOf(key) < 0) return;
          st.zone = Z.DASHBOARD; st.dashboard = HomeDashboard.items(st.tab).indexOf(key); updateFocus();
        };})(source);
      }
    }
    renderMedia();
    renderVideos();
    renderNews();
    setClass(body, 'dashboard-home', true);
    holder.setAttribute('data-view', HomeDashboard.tabs[st.tab]);
    var visible = HomeDashboard.items(st.tab);
    for (var key in dashboardNodes) if (dashboardNodes.hasOwnProperty(key)) dashboardNodes[key].style.display = visible.indexOf(key) >= 0 ? '' : 'none';
    st.dashboard = Math.max(0, Math.min(st.dashboard, visible.length - 1));
    cards = []; $('cards').innerHTML = ''; backdrop(''); updateFocus();
  }

  var bgUrl = null, bgFront = 'bgA';

  /** The first pick's photo as the background: drawn tiny and stretched, it's already as soft as a heavy blur. */
  function backdrop(url) {
    if (url === bgUrl) return;
    bgUrl = url;
    var next = bgFront === 'bgA' ? 'bgB' : 'bgA';
    if (!url) {
      setClass($('bgA'), 'on', false);
      setClass($('bgB'), 'on', false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      var canvas = $(next), ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setClass(canvas, 'on', true);
      setClass($(bgFront), 'on', false);
      bgFront = next;
    };
    img.src = url;
  }

  function renderClock() {
    renderCalendarWidget();
    var d = new Date(), c = $('clock');
    c.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    c.lastChild.textContent = formatDate('format|EEEE, MMMM d', d.getTime());
  }

  // MARK: - Shelf

  function renderShelf() {
    var n = shelf.length, gap = dashboardOn ? 24 : 48, pad = dashboardOn ? 20 : 40;
    // Legacy uses Android's 16:9 tiles; the dashboard reserves a compact named dock.
    var tw = Math.min(126 * 16 / 9, (1760 - Math.max(0, n - 1) * gap) / Math.max(1, n)), th = tw * 9 / 16;
    if (dashboardOn) {tw = Math.min(168, tw); th = 120;}
    var width = n * tw + Math.max(0, n - 1) * gap, left = (1920 - width) / 2;
    var platter = $('platter');
    platter.style.display = n ? '' : 'none';
    platter.style.left = (left - pad) + 'px';
    platter.style.width = (width + 2 * pad) + 'px';
    platter.style.top = (dashboardOn ? 866 : 814 + 126 - th) + 'px';
    platter.style.height = (th + 2 * pad) + 'px';
    $('quotes').style.right = dashboardOn ? '' : (1920 - left - width) + 'px';
    var tiles = $('tiles');
    tiles.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var t = el('div', 'tile', tiles);
      t.setAttribute('data-app-id', shelf[i].id);
      t.style.left = (left + i * (tw + gap)) + 'px';
      t.style.top = (dashboardOn ? 886 : 854 + 126 - th) + 'px';
      t.style.width = tw + 'px';
      t.style.height = th + 'px';
      if (dashboardOn) dockFace(shelf[i], t);
      else face(shelf[i], t, wordFit(shelf[i].title, tw, 30));
      hover(t, Z.SHELF, i);
    }
    st.shelf = Math.min(st.shelf, Math.max(0, n - 1));
  }

  function dockFace(app, box) {
    var input = /^com\.webos\.app\.hdmi[1-4]$/.test(app.id);
    var labels = {'com.cobalt.youtube.adfree': 'YouTube', 'space.nuvio.webos': 'Nuvio', 'com.webos.app.hdmi2': 'Receiver', 'com.webos.app.hdmi3': 'PS5'};
    var symbol = input ? 'hdmi' : 'apps';
    if (app.id === 'com.webos.app.hdmi2') symbol = 'speaker';
    if (app.id === 'com.webos.app.hdmi3') symbol = 'gamepad';
    var fallback = sym(symbol, box, 52);
    fallback.className += ' dock-symbol';
    if (app.icon && !input) {
      var image = el('img', '', box);
      image.onload = function () {if (image.parentNode === box) fallback.style.visibility = 'hidden';};
      image.onerror = function () {if (image.parentNode === box) box.removeChild(image); fallback.style.visibility = '';};
      image.src = app.icon;
    }
    el('div', 'dock-label', box, labels[app.id] || app.title);
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', app.title);
  }

  // MARK: - Drawer

  var drawerItems = [], drawerInputs = 0;

  function renderDrawer() {
    var d = $('drawer');
    d.innerHTML = '';
    drawerItems = [];
    for (var i = 0; i < inputs.length; i++) {
      var x = inputs[i];
      drawerItems.push({label: x.label || tr('Live TV'), symbol: x.symbol, off: !x.connected, run: launcher(x.id, x.label)});
    }
    drawerInputs = drawerItems.length;
    if (!HomeProfile.enabled) drawerItems.push({label: tr('All Apps'), symbol: 'apps', run: openApps});
    drawerItems.push({label: tr('Home Settings'), symbol: 'settings', run: openSettings});
    drawerItems.push({label: tr('TV Settings'), symbol: 'tv_settings', run: tvSettings});
    var n = drawerItems.length, gap = 18, groupGap = 56, groups = drawerInputs > 0 && drawerInputs < n ? 2 : 1;
    var tw = Math.min(230, (1760 - Math.max(0, n - groups) * gap - (groups - 1) * groupGap) / Math.max(1, n));
    var xPos = 80;
    for (var k = 0; k < n; k++) {
      if (k === drawerInputs && k > 0) {
        xPos += groupGap - gap;
        el('div', 'row-title', d, tr('Shortcuts')).style.left = (xPos + 4) + 'px';
      }
      if (k === 0 && drawerInputs) el('div', 'row-title', d, tr('Inputs')).style.left = '84px';
      var item = drawerItems[k], key = el('div', 'key glass' + (item.off ? ' off' : ''), d);
      key.style.left = xPos + 'px';
      key.style.width = tw + 'px';
      sym(item.symbol, key);
      el('div', 'label', key, item.label);
      hover(key, Z.DRAWER, k);
      xPos += tw + gap;
    }
    renderPanels();
    updateFocus();
  }

  function renderPanels() {
    renderDashboardWeather();
    renderCalendarWidget();
    var d = $('drawer');
    var old = d.querySelectorAll('.panel');
    for (var o = 0; o < old.length; o++) d.removeChild(old[o]);
    var wx = Prefs.weather(), coins = Data.activeCoins(), qt = coins.length > 0;
    var split = 80 + 1760 * 0.585;
    if (wx) {
      var w = el('div', 'panel glass', d);
      w.id = 'weather';
      w.style.left = '80px';
      w.style.width = ((qt ? split - 16 : 1840) - 80) + 'px';
      renderWeather(w);
    }
    if (qt) {
      var q = el('div', 'panel glass', d);
      q.id = 'prices';
      var left = wx ? split + 16 : 80;
      q.style.left = left + 'px';
      q.style.width = (1840 - left) + 'px';
      renderPrices(q, coins);
    }
  }

  function renderWeather(card) {
    el('div', 'head', card, Data.city || tr('Weather'));
    var w = Data.weather;
    if (!w) {
      el('div', 'cond', card, tr('No weather data right now.')).style.top = '96px';
      return;
    }
    if (HomeProfile.config.forecastOnly) {
      var forecast = el('div', 'forecast-days', card), labels = HomeProfile.labels;
      for (var f = 0; f < w.days.length; f++) {
        var day = w.days[f], row = el('div', 'forecast-row', forecast);
        el('div', 'forecast-day', row, f === 0 ? labels.today || day.date : labels.tomorrow || day.date);
        el('div', 'forecast-range', row, (day.min === null ? '—' : Data.degrees(day.min)) + ' – ' + (day.max === null ? '—' : Data.degrees(day.max)));
        el('div', 'forecast-rain', row, (labels.rain || '%') + ' ' + (day.rain === null ? '—' : Math.round(day.rain) + '%'));
      }
      return;
    }
    var now = el('div', 'now', card);
    sym(Data.symbol(w.code, w.isDay), now);
    el('span', 'temp', now, Data.degrees(w.temp));
    el('div', 'cond', card, Data.condition(w.code, w.isDay));
    el('div', 'range', card, trf('H:{max}', {max: Data.degrees(w.max)}) + '   ' + trf('L:{min}', {min: Data.degrees(w.min)}));
    el('div', 'split', card);
    var hours = el('div', 'hours', card), width = parseFloat(card.style.width) - 30 - 422, hw = width / 6;
    for (var i = 0; i < w.hours.length && i < 6; i++) {
      var h = el('div', 'hour', hours), x = w.hours[i];
      h.style.left = (hw * i) + 'px';
      h.style.width = hw + 'px';
      el('div', 't', h, Data.hour(x.at));
      sym(Data.symbol(x.code, x.day), h);
      el('div', 'd', h, Data.degrees(x.temp));
    }
    var sun = el('div', 'sun', card);
    if (w.sunrise) { var a = el('span', '', sun); sym('sunrise', a); a.appendChild(document.createTextNode(trf('Sunrise {time}', {time: Data.time(w.sunrise)}))); }
    if (w.sunset) { var b = el('span', '', sun); sym('sunset', b); b.appendChild(document.createTextNode(trf('Sunset {time}', {time: Data.time(w.sunset)}))); }
  }

  function renderPrices(card, coins) {
    el('div', 'head', card, HomeProfile.labels.quotes || tr('Crypto'));
    var stale = Data.staleness(Data.pricesAt, 5 * 60000);
    el('div', 'side', card, stale ? trf('quotes|{ago}', {ago: stale}) : tr('24h change'));
    for (var j = 0; j < coins.length; j++) {
      var i = coins[j], row = el('div', 'coin', card);
      row.style.top = (86 + 52 * j) + 'px';
      coin(i, row);
      el('span', 'n', row, Data.coinName(i));
      el('span', 'p', row, Data.money(Data.prices[i]));
      var ch = Data.changes[i];
      if (!isNaN(ch)) el('span', 'c ' + (ch >= 0 ? 'up' : 'down'), row, Data.change(ch));
    }
  }

  function openDrawer() {
    if (!drawerItems.length) return;
    var tiles = $('tiles').children;
    st.zone = Z.DRAWER;
    st.drawer = Math.min(drawerItems.length - 1, nearest(document.querySelectorAll('#drawer .key'), centerX(tiles[st.shelf])));
    updateFocus();
  }

  function closeDrawer() {
    var keys = document.querySelectorAll('#drawer .key');
    st.zone = Z.SHELF;
    if (shelf.length) st.shelf = nearest($('tiles').children, centerX(keys[st.drawer]));
    updateFocus();
  }

  // MARK: - All Apps

  function renderApps() {
    var sheet = $('apps');
    sheet.firstChild.textContent = tr('All Apps');
    var grid = sheet.lastChild;
    grid.innerHTML = '';
    for (var i = 0; i < others.length; i++) {
      var r = Math.floor(i / 5), c = i % 5, cell = el('div', 'cell', grid);
      cell.style.left = (130 + c * 340) + 'px';
      cell.style.top = (196 + r * 239) + 'px';
      face(others[i], el('div', 'face', cell), wordFit(others[i].title, 300, 34));
      el('div', 'label', cell, others[i].title);
      hover(cell, Z.APPS, i);
    }
  }

  function openApps() {
    renderApps();
    st.zone = Z.APPS;
    st.grid = 0;
    setClass($('apps'), 'open', true);
    updateFocus();
  }

  function closeSheets() {
    dismissNewsReport();
    stopDiagnostics();
    setClass($('apps'), 'open', false);
    setClass($('settings'), 'open', false);
    setClass($('shelfedit'), 'open', false);
    setClass($('langpick'), 'open', false);
    langHint = null;
    st.zone = settingsReturnTop ? Z.TOP : Z.SHELF;
    if (settingsReturnTop) st.top = tabCount();
    settingsReturnTop = false;
    updateFocus();
  }

  // MARK: - Home Settings

  var settingsReturnTop = false;
  var diagnosticsOn = false, diagnosticStats = {}, diagnosticMonitor = Diagnostics.monitor(function (done) { return TV.readStats(done); });
  var calendarOn = false;
  var homelabOn = false, homelabStats = {}, homelabAt = 0;
  var homelabMonitor = Diagnostics.monitor(function (done) {
    return TV.readHomelab((HomeProfile.config.homelab || {}).host, done);
  }, window, {parse: Homelab.parse, every: 30000, warmup: 1500, timeout: 8000});
  var frameRequest = null, frameStart = null, frameTimes = [], uiFps = null;
  function stopDiagnostics() {
    diagnosticsOn = false;
    homelabOn = false;
    calendarOn = false;
    diagnosticMonitor.stop();
    homelabMonitor.stop();
    if (frameRequest !== null) window.cancelAnimationFrame(frameRequest);
    frameRequest = null;
    frameStart = null;
    frameTimes = [];
  }
  function openDiagnostics() {
    stopDiagnostics();
    diagnosticsOn = true;
    diagnosticStats = {};
    uiFps = null;
    st.zone = Z.SETTINGS;
    st.row = 0;
    setClass($('settings'), 'open', true);
    function frame(at) {
      if (!diagnosticsOn || document.hidden) return;
      if (frameStart !== null && at > frameStart) frameTimes.push(at - frameStart);
      frameStart = at;
      if (frameTimes.length >= 120) {
        var total = 0;
        for (var i = 0; i < frameTimes.length; i++) total += frameTimes[i];
        uiFps = 1000 * frameTimes.length / total;
        frameTimes = [];
      }
      frameRequest = window.requestAnimationFrame(frame);
    }
    frameRequest = window.requestAnimationFrame(frame);
    renderSettings();
    diagnosticMonitor.start(function (stats) {
      if (!diagnosticsOn || document.hidden) return;
      diagnosticStats = stats;
      renderSettings();
    });
  }
  function diagnosticRows() {
    function value(n, unit) { return typeof n === 'number' && isFinite(n) ? Math.round(n) + unit : '—'; }
    var s = diagnosticStats, labels = HomeProfile.labels;
    return [
      {label: 'CPU', value: value(s.cpuPercent, '%')},
      {label: 'RAM', value: value(s.usedMB, '') + ' / ' + value(s.totalMB, ' MB')},
      {label: labels.panel || 'Panel (driver)', value: value(s.panelHz, ' Hz')},
      {label: labels.compositor || 'Compositor', value: value(s.compositorHz, ' Hz')},
      {label: 'UI FPS', value: value(uiFps, ' FPS')}
    ].map(function (row) { row.readOnly = true; row.step = function () {}; return row; });
  }

  var widgetKinds = dashboardOn ? ['arch', 'weather', 'calendar', 'webosbrew'] : ['arch', 'webosbrew'];
  var widgetsOn = !!HomeProfile.config.homeWidgets, widgetsPaused = false, widgetNodes = {}, widgetControl = null;
  function syncHomeWidgets() {
    if (widgetControl) widgetControl.sync(!document.hidden && !widgetsPaused && !sheetOpen() && st.zone !== Z.DRAWER);
  }
  function initHomeWidgets() {
    if (!widgetsOn) return;
    setClass(body, 'home-widgets', true);
    var holder = $('home-widgets'), labels = HomeProfile.labels;
    holder.innerHTML = '';
    for (var i = 0; i < widgetKinds.length; i++) {
      var card = el('button', 'home-widget', holder);
      card.setAttribute('data-widget', widgetKinds[i]);
      var titles = {arch: labels.homelab || 'Homelab · Arch', webosbrew: 'webOSbrew', weather: labels.weather || 'Weather', calendar: labels.calendar || 'Calendar'};
      el('div', 'widget-title', card, titles[widgetKinds[i]]);
      widgetNodes[widgetKinds[i]] = {status: el('div', 'widget-status', card), detail: el('div', 'widget-detail', card)};
      hover(card, Z.WIDGETS, i);
    }
    var readUpdates = BrewUpdates.reader(function (done) { return TV.readBrewApps(done); }, BrewUpdates.repository);
    widgetControl = HomeWidgets.controller(function (done) {return TV.readHomelab((HomeProfile.config.homelab || {}).host, done);}, readUpdates, window, renderHomeWidgets);
    syncHomeWidgets();
  }
  function renderHomeWidgets(state) {
    var s = state.lab, b = state.brew, labels = HomeProfile.labels;
    function number(n, unit) {return typeof n === 'number' && isFinite(n) ? Math.round(n) + unit : '—';}
    widgetNodes.arch.status.textContent = s.loading ? labels.waiting || '…' : s.available ? labels.online || 'OK' : labels.offline || '—';
    widgetDetail(widgetNodes.arch.detail, s.available ? ['CPU ' + number(s.cpuPercent, '%') + ' · RAM ' + number(s.usedMB, '') + '/' + number(s.totalMB, ' MB'), 'Docker ' + number(s.dockerRunning, '') + '/' + number(s.dockerTotal, '') + ' · ' + number(s.temperature, ' °C')] : ['—']);
    widgetNodes.webosbrew.status.textContent = b.loading ? labels.waiting || '…' : !b.available ? labels.offline || '—' : (b.updates.length ? b.updates.length + ' ' + (labels.updates || 'updates') : labels.upToDate || 'OK');
    var updates = b.available ? b.updates.slice(0, 2).map(function (app) {return app.title + ' · ' + app.installed + ' → ' + app.latest;}) : [];
    widgetDetail(widgetNodes.webosbrew.detail, updates.length ? updates : [b.available ? b.checked + ' ' + (labels.appsChecked || 'apps') : '—']);
    renderDashboardWeather();
    renderCalendarWidget();
  }

  function widgetDetail(node, rows) {
    node.textContent = '';
    for (var i = 0; i < rows.length && i < 2; i++) el('div', 'widget-line', node, rows[i]);
  }

  function renderCalendarWidget() {
    if (!widgetNodes || !widgetNodes.calendar) return;
    var labels = HomeProfile.labels, calendar = CalendarFeed.view(HomeProfile.config);
    widgetNodes.calendar.status.textContent = labels.calendarScope || 'Gmail · holidays';
    widgetDetail(widgetNodes.calendar.detail, calendar.available ? calendar.preview.map(function(row){return row.label + ' · ' + row.value;}) : [calendar.stale ? labels.calendarStale || 'Atualização necessária' : labels.calendarPending || 'Calendar not connected']);
    if (calendarOn && !calendar.available) {closeSheets();st.zone = Z.WIDGETS;st.widget = 2;updateFocus();}
  }

  function openCalendar() {
    var calendar = CalendarFeed.view(HomeProfile.config);
    if (!calendar.available) {toast(calendar.stale ? HomeProfile.labels.calendarStale || 'Atualização necessária' : HomeProfile.labels.calendarPending || 'Calendar not connected');return;}
    stopDiagnostics(); calendarOn = true; st.zone = Z.SETTINGS; st.row = 0;
    renderSettings(); setClass($('settings'), 'open', true); updateFocus();
  }

  function renderDashboardWeather() {
    if (!widgetNodes.weather) return;
    var days = Data.weather && Data.weather.days || [], labels = HomeProfile.labels;
    widgetNodes.weather.status.textContent = Data.city || '—';
    var rows = days.slice(0, 2).map(function (day, i) {
      function n(value, suffix) {return typeof value === 'number' && isFinite(value) ? Math.round(value) + suffix : '—';}
      return (i ? labels.tomorrow || 'Tomorrow' : labels.today || 'Today') + ' · ' + (day.min === null ? '—' : Data.degrees(day.min)) + '–' + (day.max === null ? '—' : Data.degrees(day.max)) + ' · ' + n(day.rain, '%');
    });
    widgetDetail(widgetNodes.weather.detail, rows.length ? rows : [labels.offline || '—']);
  }

  function openHomelab() {
    stopDiagnostics();
    homelabOn = true;
    homelabStats = {loading: true};
    homelabAt = 0;
    st.zone = Z.SETTINGS;
    st.row = 0;
    setClass($('settings'), 'open', true);
    renderSettings();
    homelabMonitor.start(function (stats) {
      if (!homelabOn || document.hidden) return;
      homelabStats = stats;
      homelabAt = stats.available ? Date.now() : 0;
      renderSettings();
    });
  }
  function homelabRows() {
    var s = homelabStats, labels = HomeProfile.labels;
    function value(n, unit) { return typeof n === 'number' && isFinite(n) ? Math.round(n) + unit : '—'; }
    var uptime = typeof s.uptimeSeconds === 'number' && isFinite(s.uptimeSeconds)
      ? Math.floor(s.uptimeSeconds / 86400) + 'd ' + Math.floor(s.uptimeSeconds % 86400 / 3600) + 'h' : '—';
    var readAt = homelabAt ? new Date(homelabAt) : null;
    var readTime = readAt ? [readAt.getHours(), readAt.getMinutes(), readAt.getSeconds()].map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':') : '—';
    return [
      {label: labels.homelabStatus || 'Status', value: s.loading ? labels.waiting || '…' : s.available ? labels.online || 'OK' : labels.offline || '—'},
      {label: 'CPU', value: value(s.cpuPercent, '%')},
      {label: labels.load || 'Load 1m', value: typeof s.load1 === 'number' && isFinite(s.load1) ? s.load1.toFixed(2) : '—'},
      {label: 'RAM', value: value(s.usedMB, '') + ' / ' + value(s.totalMB, ' MB')},
      {label: labels.uptime || 'Uptime', value: uptime},
      {label: labels.docker || 'Docker', value: value(s.dockerRunning, '') + ' / ' + value(s.dockerTotal, '')},
      {label: labels.temperature || 'CPU °C', value: value(s.temperature, ' °C')},
      {label: labels.received || 'HH:mm:ss', value: readTime}
    ].map(function (row) { row.readOnly = true; row.step = function () {}; return row; });
  }

  function settingRows() {
    if (calendarOn) return CalendarFeed.view(HomeProfile.config).rows.map(function(row){return {label:row.label,value:row.value,readOnly:true,step:function(){toast(row.value);}};});
    if (homelabOn) return homelabRows();
    if (diagnosticsOn) return diagnosticRows();
    var unit = Prefs.temperature(), theme = Prefs.theme();
    var auto = tr('Automatic'), picked = pickedLanguage();
    var rows = [
      {label: tr('Language'), value: picked === 'auto' ? auto : I18N.languageName(picked), opens: true, language: true,
        step: function (d) { if (d >= 0) openLanguages(); }},
      {label: tr('Temperature'), value: unit === 'C' ? '°C' : unit === 'F' ? '°F' : tr('unit|Automatic'),
        step: function (d) { cycle('temperature', ['auto', 'C', 'F'], unit, d); renderPanels(); }},
      {label: tr('Theme'), value: theme === 'light' ? tr('Light') : theme === 'dark' ? tr('Dark') : auto,
        step: function (d) { cycle('theme', ['auto', 'light', 'dark'], theme, d); checkNight(); }},
      {label: tr('Weather widget'), toggle: Prefs.weather(),
        step: function () { Prefs.set('weather', !Prefs.weather()); renderPanels(); }},
      {label: tr('Quotes widget'), toggle: Prefs.quotes(),
        step: function () { Prefs.set('quotes', !Prefs.quotes()); Data.settingsChanged(); }}
    ];
    if (dashboardOn) {
      rows.unshift({label: tr('HDMI Inputs'), value: '›', step: function () {
        closeSheets(); st.zone = Z.SHELF; openDrawer(); st.drawer = 0; updateFocus();
      }}, {label: HomeProfile.labels.diagnostics || 'CPU / RAM / Hz', value: '›', step: openDiagnostics});
    }
    var names = ['Bitcoin', 'Ethereum', 'Solana', tr('Dollar'), 'Euro'];
    var count = HomeProfile.config.forex ? 5 : Data.currency === 'BRL' ? 4 : 3;
    for (var i = 0; i < count; i++) {
      if (HomeProfile.config.forex && (i === 1 || i === 2)) continue;
      (function (i) {
        rows.push({label: names[i], toggle: Prefs.quotes() && Prefs.coin(i), dim: !Prefs.quotes(),
          step: function () { if (Prefs.quotes()) { Prefs.setCoin(i, !Prefs.coin(i)); Data.settingsChanged(); } }});
      })(i);
    }
    if (!HomeProfile.enabled) rows.push({label: tr('Shelf'), value: '›', step: function (d) { if (d >= 0) openShelfEdit(); }});
    rows.push({label: tr('TV Settings'), value: '›', step: function (d) { if (d >= 0) tvSettings(); }});
    if (HomeProfile.enabled) {
      if (!dashboardOn) rows.push({label: HomeProfile.labels.diagnostics || 'CPU / RAM / Hz', value: '›',
        step: function () { openDiagnostics(); }});
      if (HomeProfile.config.homelab) rows.push({label: HomeProfile.labels.homelab || 'Homelab', value: '›', step: openHomelab});
      var tools = HomeProfile.config.tools || [];
      for (var t = 0; t < tools.length; t++) {
        (function (tool) { rows.push({label: tool.title, value: '›', step: launcher(tool.id, tool.title)}); })(tools[t]);
      }
    }
    return rows;
  }

  function cycle(name, values, current, d) {
    var i = values.indexOf(current);
    Prefs.set(name, values[(i + (d || 1) + values.length) % values.length]);
  }

  var rowsNow = [];

  function renderSettings() {
    var box = $('settings').firstChild;
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('settings', title);
    title.appendChild(document.createTextNode(calendarOn ? HomeProfile.labels.calendar || 'Calendário' : homelabOn ? HomeProfile.labels.homelab || 'Homelab' : diagnosticsOn ? 'CPU · RAM · Hz' : tr('Home Settings')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    rowsNow = settingRows();
    list.style.height = Math.min(rowsNow.length, 7) * 78 + 'px';
    for (var i = 0; i < rowsNow.length; i++) {
      var r = rowsNow[i], row = el('div', 'row' + (r.dim ? ' dim' : ''), holder, r.label);
      if (r.toggle !== undefined) setClass(el('div', 'toggle', row), 'on', r.toggle);
      else {
        var v = el('span', 'value', row);
        if (r.readOnly || r.value === '›') v.textContent = r.value;
        else if (r.opens) { v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
        else { el('span', 'chev', v, '‹'); v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
      }
      hover(row, Z.SETTINGS, i);
    }
    el('div', 'hint', box, calendarOn ? HomeProfile.labels.calendarReadOnly || '↑ ↓ · OK: título completo · Voltar'  : tr('OK or the arrows change the value.'));
    setClass($('settings'), 'calendar-sheet', calendarOn);
    updateFocus();
  }

  function openSettings(fromTop) {
    if (fromTop === true) settingsReturnTop = true;
    stopDiagnostics();
    st.zone = Z.SETTINGS;
    st.row = 0;
    renderSettings();
    setClass($('settings'), 'open', true);
    updateFocus();
  }

  // MARK: - Language: a list of every catalogue in its own name, as on Android (moving through it doesn't switch the app)

  var langHint = null;

  function languageChoices() {
    return ['auto'].concat(I18N.languages());
  }

  /** The language in use: "auto", or the catalogue the setting resolved to ("pt-BR" in config.properties is "pt"). */
  function pickedLanguage() {
    return Prefs.language() === 'auto' ? 'auto' : I18N.lang;
  }

  function renderLanguages() {
    var box = $('langpick').firstChild, choices = languageChoices(), current = choices.indexOf(pickedLanguage());
    box.innerHTML = '';
    el('div', 'title', box, tr('Language'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(choices.length, 7) * 78 + 'px';
    for (var i = 0; i < choices.length; i++) {
      var row = el('div', 'row', holder, choices[i] === 'auto' ? tr('Automatic') : I18N.languageName(choices[i]));
      if (i === current) sym('check', el('span', 'value', row));
      hover(row, Z.LANG, i);
    }
    langHint = el('div', 'hint', box);
    updateFocus();
  }

  function openLanguages() {
    setClass($('settings'), 'open', false);
    st.zone = Z.LANG;
    st.lang = Math.max(0, languageChoices().indexOf(pickedLanguage()));
    renderLanguages();
    setClass($('langpick'), 'open', true);
    updateFocus();
  }

  /** OK: the language under the focus; Back: none. Either way, back to Home Settings, on the Language row. */
  function closeLanguages(pick) {
    setClass($('langpick'), 'open', false);
    langHint = null;
    var code = languageChoices()[st.lang];
    if (pick && code !== pickedLanguage()) {
      Prefs.set('language', code);
      I18N.set(Prefs.language());
      renderAll();
      Data.refresh();   // the picks' titles and genres come in the new language
    }
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].language) st.row = i;
    updateFocus();
  }

  // MARK: - Shelf editor: which apps, in what order

  function editList() {
    var ids = shelf.map(function (a) { return a.id; });
    return {ids: ids, rows: apps.slice().sort(function (a, b) {
      var ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    })};
  }

  function renderShelfEdit() {
    var box = $('shelfedit').firstChild, e = editList();
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('apps', title);
    title.appendChild(document.createTextNode(tr('Shelf')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(e.rows.length, 7) * 78 + 'px';
    for (var i = 0; i < e.rows.length; i++) {
      var a = e.rows[i], at = e.ids.indexOf(a.id), row = el('div', 'row', holder, a.title);
      el('span', 'value', row, at >= 0 ? '#' + (at + 1) : tr('shelf|Off'));
      hover(row, Z.EDIT, i);
    }
    el('div', 'hint', box, trf('OK adds or removes (up to {n}). ← → change the order.', {n: MAX_SHELF}));
    updateFocus();
  }

  function openShelfEdit() {
    setClass($('settings'), 'open', false);
    st.zone = Z.EDIT;
    st.edit = 0;
    renderShelfEdit();
    setClass($('shelfedit'), 'open', true);
    updateFocus();
  }

  function editShelf(dx) {
    var e = editList(), app = e.rows[st.edit];
    if (!app) return;
    var ids = e.ids.slice(), at = ids.indexOf(app.id);
    if (dx === 0) {
      if (at >= 0) ids.splice(at, 1);
      else if (ids.length < MAX_SHELF) ids.push(app.id);
      else { toast(trf('The shelf holds up to {n} apps.', {n: MAX_SHELF})); return; }
    } else {
      if (at < 0) return;
      var to = Math.max(0, Math.min(ids.length - 1, at + dx));
      ids.splice(at, 1);
      ids.splice(to, 0, app.id);
    }
    Prefs.set('shelf', ids);
    pickShelf();
    renderShelf();
    var again = editList();
    for (var i = 0; i < again.rows.length; i++) if (again.rows[i].id === app.id) st.edit = i;
    renderShelfEdit();
  }

  // MARK: - Opening things

  function launcher(id, name) {
    return function () {
      TV.launch(id, null, function (ok) {
        if (!ok) toast(trf("Couldn't open {app}.", {app: name || id}));
      });
    };
  }

  function tvSettings() {
    TV.settings(function (ok) {
      if (!ok) toast(tr("Couldn't open TV Settings"));
    });
  }

  function liveTV() {
    for (var i = 0; i < inputs.length; i++) if (inputs[i].key === 'live') return inputs[i];
    return null;
  }

  function activate() {
    switch (st.zone) {
      case Z.TOP:
        if (st.top < tabCount()) return;
        if (st.top >= tabCount() + topButtonCount()) return;
        if (dashboardOn) {openSettings(true);return;}
        if (st.top === tabCount()) {
          if (HomeProfile.enabled) openDiagnostics();
          else { var live = liveTV(); if (live) launcher(live.id, tr('Live TV'))(); }
        }
        else if (st.top === tabCount() + 1) { st.zone = Z.SHELF; openDrawer(); st.drawer = 1 < drawerInputs ? 1 : 0; updateFocus(); }
        else openSettings();
        return;
      case Z.DASHBOARD:
        var source = HomeDashboard.items(st.tab)[st.dashboard], target = HomeDashboard.app(HomeProfile.config, source);
        var focused = focusedArtwork();
        if (((source === 'youtube' && videoItems.length) || (source === 'media' && mediaItems.length)) && !focused) {renderDashboard();return;}
        var videoTarget = source === 'youtube' && videoItems.length ? YouTubeFeed.target(HomeProfile.config, st.video, focused.item.id) : null;
        if (videoTarget) TV.launch(videoTarget.id, videoTarget.params, function (ok) {if (!ok) toast(trf("Couldn't open {app}.", {app: 'YouTube'}));});
        else if (source === 'youtube' && videoItems.length) {renderVideos();updateFocus();toast(HomeProfile.labels.youtubeRefresh || 'Inscrições aguardando atualização');}
        else if (target) launcher(target.id, target.title)();
        else if (source === 'news' && newsItems.length) openNewsReport();
        else toast(HomeProfile.labels.newsPending || 'News not connected');
        return;
      case Z.REPORT:
        move(0,0);
        return;
      case Z.WIDGETS:
        var kind = widgetKinds[st.widget];
        if (kind === 'arch') openHomelab();
        else if (kind === 'webosbrew') launcher('org.webosbrew.hbchannel', 'webOSbrew')();
        else if (kind === 'weather') {openDrawer();}
        else if (kind === 'calendar') openCalendar();
        return;
      case Z.CARDS:
        var p = cards[st.card], app = p && Data.appFor(p.app);
        if (app) launcher(app.id, app.title)();
        return;
      case Z.SHELF:
        if (shelf[st.shelf]) launcher(shelf[st.shelf].id, shelf[st.shelf].title)();
        return;
      case Z.DRAWER:
        if (drawerItems[st.drawer]) drawerItems[st.drawer].run();
        return;
      case Z.APPS:
        if (others[st.grid]) launcher(others[st.grid].id, others[st.grid].title)();
        return;
      case Z.SETTINGS:
        if (rowsNow[st.row]) { rowsNow[st.row].step(1); if (st.zone === Z.SETTINGS) renderSettings(); }
        return;
      case Z.EDIT:
        editShelf(0);
        return;
      case Z.LANG:
        closeLanguages(true);
        return;
    }
  }

  function selectTab(i) {
    if (i === st.tab) return;
    st.tab = i;
    renderCards();
  }

  function move(dx, dy) {
    var tiles = $('tiles').children, cardNodes = $('cards').children;
    switch (st.zone) {
      case Z.SHELF:
        if (dx) st.shelf = Math.max(0, Math.min(shelf.length - 1, st.shelf + dx));
        else if (dy > 0) { openDrawer(); return; }
        else if (dy < 0) {
          if (widgetsOn) { st.zone = Z.WIDGETS; st.widget = nearest($('home-widgets').children, centerX(tiles[st.shelf])); }
          else if (cards.length) { st.zone = Z.CARDS; st.card = nearest(cardNodes, centerX(tiles[st.shelf])); }
          else { st.zone = Z.TOP; st.top = st.tab; }
        }
        break;
      case Z.WIDGETS:
        if (dx) st.widget = Math.max(0, Math.min(widgetKinds.length - 1, st.widget + dx));
        else if (dy < 0) {st.zone = dashboardOn && HomeDashboard.items(st.tab).length ? Z.DASHBOARD : cards.length ? Z.CARDS : Z.TOP; st.dashboard = Math.max(0, HomeDashboard.items(st.tab).length - 1); st.top = st.tab;}
        else if (dy > 0) {st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX($('home-widgets').children[st.widget]));}
        break;
      case Z.REPORT:
        var validReport=newsReportState&&NewsFeed.current(HomeProfile.config,newsReportState.id,newsReportState.analyzedAt);
        if(!validReport){closeNewsReport();renderNews();updateFocus();break;}
        var reportBody=$('news-report').querySelector('.report-scroll');
        if(reportBody&&dy)reportBody.scrollTop+=dy*140;
        break;
      case Z.DASHBOARD:
        if (dx && HomeDashboard.items(st.tab)[st.dashboard] === 'youtube' && videoItems.length && (dx < 0 || st.video < videoItems.length - 1)) {
          st.video = Math.max(0, Math.min(videoItems.length - 1, st.video + dx)); updateFocus(); return;
        }
        if (dx && HomeDashboard.items(st.tab)[st.dashboard] === 'news' && newsItems.length) {st.news = Math.max(0, Math.min(newsItems.length - 1, st.news + dx));updateFocus();return;}
        if (dx && HomeDashboard.items(st.tab)[st.dashboard] === 'media' && mediaItems.length && (dx > 0 || st.media > 0)) {
          st.media = Math.max(0, Math.min(mediaItems.length - 1, st.media + dx)); updateFocus(); return;
        }
        var next = HomeDashboard.next(st.tab, st.dashboard, dx, dy);
        st.zone = next.zone;
        if (next.index !== undefined) st.dashboard = next.index;
        if (st.zone === Z.TOP) st.top = st.tab;
        if (st.zone === Z.WIDGETS && !widgetsOn) st.zone = Z.SHELF;
        break;
      case Z.CARDS:
        if (dx) st.card = Math.max(0, Math.min(cards.length - 1, st.card + dx));
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        else if (widgetsOn) st.zone = Z.WIDGETS;
        else if (shelf.length) { st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX(cardNodes[st.card])); }
        break;
      case Z.TOP:
        if (dx) {
          st.top = Math.max(0, Math.min(tabCount() + topButtonCount() - 1, st.top + dx));
          if (st.top < tabCount()) selectTab(st.top);   // as on Apple TV: focusing a tab selects it
        } else if (dy > 0) {
          if (dashboardOn && HomeDashboard.items(st.tab).length) {st.zone = Z.DASHBOARD; st.dashboard = 0;}
          else if (cards.length) { st.zone = Z.CARDS; st.card = Math.min(cards.length - 1, st.top < tabCount() ? 0 : cards.length - 1); }
          else st.zone = widgetsOn ? Z.WIDGETS : Z.SHELF;
        }
        break;
      case Z.DRAWER:
        if (dx) st.drawer = Math.max(0, Math.min(drawerItems.length - 1, st.drawer + dx));
        else if (dy < 0) { closeDrawer(); return; }
        break;
      case Z.APPS:
        var g = st.grid + dx + dy * 5;
        if (g >= 0 && g < others.length && (dx === 0 || Math.floor(g / 5) === Math.floor(st.grid / 5))) st.grid = g;
        break;
      case Z.SETTINGS:
        if (dy) st.row = Math.max(0, Math.min(rowsNow.length - 1, st.row + dy));
        else if (dx && rowsNow[st.row]) {
          var r = rowsNow[st.row];
          if (r.value !== '›') { r.step(dx); if (st.zone === Z.SETTINGS) renderSettings(); }
        }
        break;
      case Z.EDIT:
        if (dy) st.edit = Math.max(0, Math.min(apps.length - 1, st.edit + dy));
        else if (dx) editShelf(dx);
        break;
      case Z.LANG:
        if (dy) st.lang = Math.max(0, Math.min(languageChoices().length - 1, st.lang + dy));
        break;
    }
    updateFocus();
  }

  function back() {
    if(st.zone===Z.REPORT){closeNewsReport();return;}
    if (calendarOn) {closeSheets();st.zone = Z.WIDGETS;st.widget = 2;updateFocus();return;}
    if (diagnosticsOn || homelabOn) { openSettings(); return; }
    if (st.zone === Z.EDIT) { setClass($('shelfedit'), 'open', false); openSettings(); st.row = rowsNow.length - 2; updateFocus(); return; }
    if (st.zone === Z.LANG) { closeLanguages(false); return; }
    if (sheetOpen()) { closeSheets(); return; }
    if (st.zone === Z.DRAWER) { closeDrawer(); return; }
    if (st.zone !== Z.SHELF && shelf.length) { st.zone = Z.SHELF; updateFocus(); return; }
    TV.back();
  }

  /** The pointer focuses what it's over (the Magic Remote, or a mouse when previewing). */
  function hover(node, zone, index) {
    node.onmouseover = function () {
      if (saverOn || (sheetOpen() !== (zone === Z.APPS || zone === Z.SETTINGS || zone === Z.EDIT || zone === Z.LANG))) return;
      if (zone === Z.DRAWER && st.zone !== Z.DRAWER) return;
      if (zone !== Z.DRAWER && st.zone === Z.DRAWER && zone !== Z.SHELF) return;
      if (zone === Z.SHELF && st.zone === Z.DRAWER) closeDrawer();
      st.zone = zone;
      if (zone === Z.TOP) { st.top = index; if (index < tabCount()) selectTab(index); }
      else if (zone === Z.WIDGETS) st.widget = index;
      else if (zone === Z.CARDS) st.card = index;
      else if (zone === Z.SHELF) st.shelf = index;
      else if (zone === Z.DRAWER) st.drawer = index;
      else if (zone === Z.APPS) st.grid = index;
      else if (zone === Z.SETTINGS) st.row = index;
      else if (zone === Z.EDIT) st.edit = index;
      else if (zone === Z.LANG) st.lang = index;
      updateFocus();
    };
    node.onclick = function () { node.onmouseover(); activate(); };
  }

  // MARK: - Toast

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    setClass(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { setClass(t, 'on', false); }, 6000);
  }

  // MARK: - Night, clock, screensaver

  function checkNight() {
    setClass(body, 'night', (dashboardOn && Prefs.theme() === 'auto') || Data.isNight(Date.now()));
  }

  var saverOn = false, idleAt = Date.now(), saverIndex = 0, saverTimer = 0, saverGeneration = 0, idleGeneration = 0;
  var SAVER_AFTER = IdlePolicy.saverDelay(HomeProfile.config.idleMinutes), nextSaverAttempt = 0;

  function showSaver() {
    if (document.hidden) return;
    if (HomeProfile.config.nativeScreensaver) {
      var origin = idleGeneration, generation = ++saverGeneration, elapsed = Math.max(0, Date.now() - idleAt);
      nextSaverAttempt = Date.now() + 30000;
      TV.launch('com.webos.app.screensaver', {idleSource: 'freemytv', idleElapsedMs: elapsed}, function (ok) {
        if (generation !== saverGeneration) return;
        if (document.hidden || origin !== idleGeneration) {if (ok) TV.dismissScreensaver();return;}
        widgetsPaused = ok;
        syncHomeWidgets();
        if (!ok && !document.hidden) toast(trf("Couldn't open {app}.", {app: 'Screensaver'}));
      });
      return;
    }
    var photos = Data.showcase().filter(function (p) { return p.backdrop && Data.appFor(p.app); });
    saverOn = true;
    var s = $('saver');
    s.innerHTML = '';
    var a = el('div', 'photo', s), b = el('div', 'photo', s);
    el('div', 'shade', s);
    var clock = el('div', 'clock', s);
    el('div', 'time', clock);
    el('div', 'date', clock);
    el('div', 'title', clock);
    var front = a;
    function next() {
      if (!saverOn) return;
      var p = photos.length ? photos[saverIndex++ % photos.length] : null;
      var back = front === a ? b : a;
      if (p) {
        back.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'original') + ')';
        back.style.webkitTransform = back.style.transform = 'scale(1.0)';
        clock.lastChild.textContent = p.title;
        setTimeout(function () {
          setClass(back, 'on', true);
          setClass(front, 'on', false);
          back.style.webkitTransform = back.style.transform = 'scale(1.08) translateX(-1.5%)';
          front = back;
        }, 60);
      }
      tickSaverClock(clock);
      saverTimer = setTimeout(next, 12000);
    }
    setClass(s, 'on', true);
    next();
  }

  function tickSaverClock(clock) {
    var d = new Date();
    clock.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    clock.children[1].textContent = formatDate('format|EEEE, MMMM d', d.getTime());
  }

  function hideSaver() {
    saverOn = false;
    clearTimeout(saverTimer);
    setClass($('saver'), 'on', false);
  }

  function poke() {
    idleGeneration++;
    idleAt = Date.now();
    nextSaverAttempt = 0;
    widgetsPaused = false;
    syncHomeWidgets();
    if (saverOn) { hideSaver(); return true; }
    return false;
  }

  // MARK: - Keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    releaseArtworkPress();
    if (poke()) { e.preventDefault(); return; }   // the first press only wakes the screen
    if (k === TV.keys.left) move(-1, 0);
    else if (k === TV.keys.right) move(1, 0);
    else if (k === TV.keys.up) move(0, -1);
    else if (k === TV.keys.down) move(0, 1);
    else if (k === TV.keys.ok) activate();
    else if (k === TV.keys.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function (event) { pointerX = event.clientX; pointerY = event.clientY; poke(); });
  document.addEventListener('mousedown', beginArtworkPress, true);
  document.addEventListener('mouseup', releaseArtworkPress, true);
  document.addEventListener('pointercancel', releaseArtworkPress, true);
  window.addEventListener('blur', releaseArtworkPress);

  // MARK: - Start

  function renderAll() {
    renderTop();
    renderQuotes();
    cards = [];
    renderCards();
    renderShelf();
    renderDrawer();
    renderClock();
    checkNight();
    if (st.zone === Z.SETTINGS) renderSettings();
    updateFocus();
  }

  /** hide_apps in config.properties: left out of the shelf, All Apps and the picks, by id or name (part of it). */
  var HIDE = (CONFIG.hideApps || []).map(function (s) { return s.toLowerCase(); });
  function hidden(app) {
    var id = (app.id || '').toLowerCase(), title = (app.title || '').toLowerCase();
    for (var i = 0; i < HIDE.length; i++) if (id.indexOf(HIDE[i]) >= 0 || title.indexOf(HIDE[i]) >= 0) return true;
    return false;
  }

  function loadApps(done) {
    TV.apps(function (list) {
      apps = list.filter(function (a) { return !hidden(a); });
      Data.setApps(apps);
      TV.inputs(function (list2) {
        inputs = HomeProfile.inputs(list2);
        pickShelf();
        if (done) done();
      });
    });
  }

  /** A running dashboard resumes its navigation; the legacy home reopens at the first shelf app. */
  function reset() {
    var zone = dashboardOn && !sheetOpen() && st.zone !== Z.DRAWER ? st.zone : null;
    widgetsPaused = false;
    idleGeneration++;
    idleAt = Date.now();
    nextSaverAttempt = 0;
    hideSaver();
    closeSheets();
    if (zone) st.zone = zone;
    if (!dashboardOn) {
      st.zone = Z.SHELF;
      st.shelf = 0;
      if (st.tab !== 0) { st.tab = 0; renderCards(); }
    }
    updateFocus();
  }

  Data.onChange(function () {
    renderQuotes();
    renderCards();
    renderPanels();
    checkNight();
  });

  function reopened() {
    // LG: with handlesRelaunch the app has to come to the front itself, or opening it again while it runs shows nothing.
    if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    reset();
    loadApps(function () { renderShelf(); renderDrawer(); renderCards(); updateFocus(); Data.refresh(); });
  }

  window.addEventListener('resize', fit);
  window.addEventListener('focus', poke);
  document.addEventListener('webOSRelaunch', reopened);   // LG: opened again while running
  window.addEventListener('appcontrol', reopened);        // Samsung: the same
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      featurePreview.update(null);
      releaseArtworkPress();
      hideSaver();
      if (calendarOn || st.zone === Z.REPORT) back();
      else if (diagnosticsOn || homelabOn) closeSheets();
      stopDiagnostics();
      syncHomeWidgets();
      return;
    }
    widgetsPaused = false;
    syncHomeWidgets();
    idleGeneration++;
    idleAt = Date.now();
    nextSaverAttempt = 0;
    loadApps(function () { renderShelf(); renderDrawer(); renderCards(); updateFocus(); Data.refresh(); });
  });

  I18N.set(Prefs.language());
  initDashboardScroll();
  initHomeWidgets();
  fit();
  renderTop();
  loadApps(function () {
    renderAll();
    Data.refresh();
  });
  setInterval(function () {
    if (document.hidden) return;
    renderClock();
    checkNight();
    Data.refresh();
    if (!HomeProfile.enabled && !saverOn && !sheetOpen() && Date.now() - idleAt > SAVER_AFTER) showSaver();
    if (saverOn) tickSaverClock($('saver').querySelector('.clock'));
  }, 30000);
  if (HomeProfile.enabled) setInterval(function () {
    if (!saverOn && IdlePolicy.due(Date.now(), idleAt, document.hidden, nextSaverAttempt, SAVER_AFTER)) showSaver();
  }, 1000);

  // For the browser preview and tests.
  window.FreeMyTV = {state: st, move: move, activate: activate, back: back, showSaver: showSaver, hideSaver: hideSaver, toast: toast};
})();
