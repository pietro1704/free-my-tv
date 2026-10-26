/* Two recent decoded images; late loads never replace a newer selection. */
var HomeHero = (function () {
  'use strict';
  function create(holder, onImage) {
    onImage = onImage || function () {};
    var title = holder.querySelector('.hero-title'), meta = holder.querySelector('.hero-meta');
    var art = holder.querySelector('.hero-art'), generation = 0, previous = null, cache = [];
    function paint(image, item, token) {
      if (token !== generation || document.hidden) return;
      art.style.backgroundImage = 'url("' + item.image.replace(/"/g, '%22') + '")';onImage(image);
    }
    return {update: function (item) {
      if (item && previous && item.id === previous.id && item.title === previous.title && item.meta === previous.meta && item.image === previous.image && item.presentation === previous.presentation) return;
      previous = item ? {id:item.id,title:item.title,meta:item.meta,image:item.image,presentation:item.presentation} : null;
      var token = ++generation;
      title.textContent = item ? item.title : '';meta.textContent = item ? item.meta || '' : '';
      art.style.backgroundImage = '';onImage(null, !!(item && item.image));
      if (!item) cache = [];
      if (!item || !item.image || document.hidden) return;
      for (var c = 0; c < cache.length; c++) if (cache[c].url === item.image) {
        var found = cache.splice(c,1)[0];cache.push(found);paint(found.image,item,token);return;
      }
      var image = new Image();
      image.onload = function () {
        if (token !== generation || document.hidden) return;
        cache.push({url:item.image,image:image});if (cache.length > 2) cache.shift();
        paint(image,item,token);
      };
      image.onerror = function () {if (token === generation) {art.style.backgroundImage = '';onImage(null);}};
      image.src = item.image;
    }};
  }
  return {create:create};
})();
