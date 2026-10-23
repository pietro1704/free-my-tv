/* Optional BRL feed for actual USD/EUR quotes and Bitcoin, without API keys. */
var Forex = (function () {
  'use strict';
  function quotes(body, symbols) {
    var out = [];
    for (var i = 0; i < symbols.length; i++) {
      var symbol = symbols[i] + 'BRL', value = body && body[symbol];
      if (!value) return null;
      if (value.bid === null || value.bid === '' || value.pctChange === null || value.pctChange === undefined || value.pctChange === '') return null;
      var price = Number(value.bid), change = Number(value.pctChange);
      if (!(price > 0) || !isFinite(price) || !isFinite(change) || change <= -100) return null;
      out.push({symbol: symbol, lastPrice: price, openPrice: price / (1 + change / 100)});
    }
    return out;
  }
  return {quotes: quotes};
})();
