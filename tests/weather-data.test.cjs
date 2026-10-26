const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const now = Date.parse('2026-10-26T12:00:00Z');
function weather() {
  return {
    utc_offset_seconds: 0,
    current: {temperature_2m: 25, weather_code: 2, is_day: 1},
    daily: {time: ['2026-10-26', '2026-10-27'], temperature_2m_min: [18, 19],
      temperature_2m_max: [27, 28], precipitation_probability_max: [0, 70],
      sunrise: ['2026-10-26T06:00'], sunset: ['2026-10-26T18:00']},
    hourly: {time: ['2026-10-26T13:00'], temperature_2m: [26], weather_code: [2], is_day: [1]}
  };
}
function harness(cached) {
  let at = now, changes = 0;
  const requests = [], storage = new Map();
  if (cached !== undefined) storage.set('fmtv.weather', JSON.stringify(cached));
  const context = {
    Date: class extends Date {static now() {return at}},
    window: {CONFIG: {latitude: 0, longitude: 0, showCrypto: false, homeProfile: {providerPicks: false}}},
    TV: {zone: () => ''}, navigator: {language: 'pt-BR'},
    I18N: {lang: 'pt', base: 'pt', locale: () => 'pt-BR'},
    localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
    XMLHttpRequest: function () {
      this.open = (method, url) => {this.url = url};
      this.setRequestHeader = () => {};
      this.send = () => requests.push(this);
      this.respond = (body, status = 200) => {
        this.status = status; this.responseText = JSON.stringify(body); this.readyState = 4;
        this.onreadystatechange();
      };
    }
  };
  vm.createContext(context);
  for (const name of ['profile.js', 'forecast.js', 'data.js']) {
    vm.runInContext(fs.readFileSync('web/' + name, 'utf8'), context);
  }
  context.Data.onChange(() => changes++);
  return {data: context.Data, requests, storage, changes: () => changes, advance: ms => {at += ms}};
}
const cached = body => ({place: '0,0', body, at: now});

test('valid weather publishes and caches real temperatures, zero rain and future hours', () => {
  const h = harness(); h.data.refresh();
  assert.match(h.requests[0].url, /latitude=0&longitude=0/);
  h.requests[0].respond(weather());
  assert.equal(h.data.weather.temp, 25);
  assert.equal(h.data.weather.days[0].rain, 0);
  assert.equal(h.data.weather.hours[0].temp, 26);
  assert.equal(h.data.weatherAt, now);
  assert.equal(h.changes(), 1);
  const warm = harness(JSON.parse(h.storage.get('fmtv.weather')));
  assert.equal(warm.data.weather.temp, 25);
  warm.data.refresh();
  assert.equal(warm.requests.length, 0, 'Fresh valid cache must avoid another request');
});

test('incomplete network responses do not throw, publish or replace a valid snapshot', () => {
  const h = harness(cached(weather())); h.advance(1800001);
  const previous = h.data.weather, stored = h.storage.get('fmtv.weather');
  for (const body of [null, {}, {current: {}}, {current: weather().current, daily: {}}, {current: weather().current, daily: {time: []}}]) {
    h.data.refresh();
    assert.doesNotThrow(() => h.requests.at(-1).respond(body));
    assert.equal(h.data.weather, previous);
    assert.equal(h.data.weatherAt, now);
    assert.equal(h.storage.get('fmtv.weather'), stored);
  }
  assert.equal(h.requests.length, 5, 'Invalid responses must allow retry instead of becoming fresh cache');
  assert.equal(h.changes(), 0);
});

test('invalid cached bodies cannot prevent app initialization or a fresh request', () => {
  for (const body of [undefined, null, {}, {current: weather().current}, {current: weather().current, daily: {time: null}}]) {
    let h;
    assert.doesNotThrow(() => {h = harness(cached(body))});
    assert.equal(h.data.weather, null);
    assert.equal(h.data.weatherAt, 0);
    h.data.refresh();
    assert.equal(h.requests.length, 1);
    h.requests[0].respond(weather());
    assert.equal(h.data.weather.temp, 25);
  }
});

test('missing optional sun and hourly fields retain a usable daily forecast without invented hours', () => {
  for (const hourly of [undefined, {}, {time: ['2026-10-26T13:00']}]) {
    const body = weather(); delete body.daily.sunrise; delete body.daily.sunset; body.hourly = hourly;
    const h = harness(); h.data.refresh();
    assert.doesNotThrow(() => h.requests[0].respond(body));
    assert.equal(h.data.weather.days.length, 2);
    assert.equal(h.data.weather.sunrise, 0);
    assert.equal(h.data.weather.sunset, 0);
    assert.equal(h.data.weather.hours.length, 0);
  }
});

test('timeouts and HTTP failures preserve cached weather and ignore a late completion', () => {
  const h = harness(cached(weather())); h.advance(1800001);
  const previous = h.data.weather;
  h.data.refresh(); const timedOut = h.requests[0]; timedOut.ontimeout();
  const late = weather(); late.current.temperature_2m = 99; timedOut.respond(late);
  assert.equal(h.data.weather, previous);
  h.data.refresh(); h.requests[1].respond({error: true}, 503);
  assert.equal(h.data.weather, previous);
  h.data.refresh(); h.requests[2].respond(weather());
  assert.equal(h.changes(), 1);
  assert.equal(h.data.weatherAt, now + 1800001);
});

test('a cache for another location cannot appear as the current forecast', () => {
  const h = harness({...cached(weather()), place: '1,1'});
  assert.equal(h.data.weather, null);
  h.data.refresh(); h.requests[0].respond(weather());
  assert.equal(JSON.parse(h.storage.get('fmtv.weather')).place, '0,0');
});
