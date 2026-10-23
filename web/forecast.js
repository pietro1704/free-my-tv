/* Open-Meteo daily forecasts: never substitute current temperature or invent a rain probability. */
var Forecast = (function () {
  'use strict';
  function days(daily) {
    var out = [];
    if (!daily || !daily.time) return out;
    function number(values, i) {
      var v = values && values[i];
      return typeof v === 'number' && isFinite(v) ? v : null;
    }
    for (var i = 0; i < daily.time.length && i < 2; i++) {
      var rain = number(daily.precipitation_probability_max, i);
      out.push({date: daily.time[i], min: number(daily.temperature_2m_min, i),
        max: number(daily.temperature_2m_max, i), rain: rain !== null && rain >= 0 && rain <= 100 ? rain : null});
    }
    return out;
  }
  return {days: days};
})();
