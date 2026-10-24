/* Optional, local home profile. IDs stay exact: similarly named apps are never substituted. */
var HomeProfile = (function () {
  'use strict';
  var config = (window.CONFIG || {}).homeProfile || null;
  function items() { return config && config.items || []; }
  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  return {
    enabled: !!config,
    config: config || {},
    labels: config && config.labels || {},
    shelf: function (apps, inputs) {
      var out = [], all = apps.concat(inputs), wanted = items();
      for (var i = 0; i < wanted.length; i++) {
        var item = wanted[i], source = find(all, item.id);
        if (!source || find(out, item.id)) continue;
        out.push({id: source.id, title: item.title || source.title || source.label,
          icon: item.icon || source.icon || '', color: source.color || ''});
      }
      return out;
    },
    inputs: function (list) {
      if (!config) return list;
      return list.filter(function (input) { return !!find(items(), input.id); });
    },
    catalogApp: function (apps) { return config ? find(apps, config.catalogApp) : null; }
  };
})();
