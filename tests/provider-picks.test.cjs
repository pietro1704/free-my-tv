const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
function harness(profile) {
  const requests = [], cached = {picks: [{id: 1, kind: 'movie', title: 'Prime title', app: 'prime', detailed: true}], listAt: 0};
  const context = {window: {CONFIG: {tmdbKey: 'test-key', homeProfile: profile, showCrypto: false}},
    TV: {zone: () => ''}, navigator: {language: 'pt-BR'},
    I18N: {lang: 'pt', base: 'pt', locale: () => 'pt-BR'},
    localStorage: {getItem: key => key === 'fmtv.recs' ? JSON.stringify(cached) : null, setItem() {}},
    XMLHttpRequest: function () {this.open = (method, url) => requests.push(url); this.setRequestHeader = () => {}; this.send = () => {};}};
  vm.createContext(context);
  for (const name of ['profile.js', 'data.js']) vm.runInContext(fs.readFileSync('web/' + name, 'utf8'), context);
  context.Data.setApps([{id: 'space.nuvio.webos', title: 'Nuvio'}, {id: 'amazon', title: 'Prime Video'}]);
  return {...context, requests};
}
test('disabled provider picks reject cached cards and stop TMDB recommendation requests', () => {
  const h = harness({items: [{id:'space.nuvio.webos'}], catalogApp: 'space.nuvio.webos', providerPicks: false});
  assert.equal(h.Data.picks(null).length, 0);
  assert.equal(h.Data.showcase().length, 0);
  h.Data.refresh();
  assert.equal(h.requests.filter(url => url.includes('api.themoviedb.org')).length, 0);
});
test('a custom player never impersonates Prime or any other provider', () => {
  const h = harness({items: [{id:'space.nuvio.webos'}], catalogApp: 'space.nuvio.webos'});
  assert.equal(h.Data.appFor('prime'), null);
  assert.equal(h.Data.appFor('netflix'), null);
  assert.equal(h.Data.appFor('nuvio').id, 'space.nuvio.webos');
  h.Data.setApps([]);
  assert.equal(h.Data.appFor('nuvio'), null);
});
test('generic homes retain their installed-provider recommendations', () => {
  const h = harness(null);
  assert.equal(h.Data.picks(null).length, 1);
  assert.equal(h.Data.appFor('prime').id, 'amazon');
  h.Data.refresh();
  assert.ok(h.requests.some(url => url.includes('api.themoviedb.org')));
});
