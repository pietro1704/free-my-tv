/* One contextual image; late loads can never replace a newer selection. */
var HomeHero = (function () {
  'use strict';
  function create(holder, onImage) {
    onImage = onImage || function () {};
    var title = holder.querySelector('.hero-title'), meta = holder.querySelector('.hero-meta');
    var art = holder.querySelector('.hero-art'), generation = 0, key = null;
    return {update: function (item) {
      var next = item ? JSON.stringify([item.id, item.title, item.meta, item.image, item.presentation]) : null;
      if (key === next && next !== null) return;
      key = next; var token = ++generation;
      title.textContent = item ? item.title : ''; meta.textContent = item ? item.meta || '' : '';
      art.style.backgroundImage = '';onImage(null);
      if (!item || !item.image || document.hidden) return;
      var image = new Image();
      image.onload = function () {
        if (token === generation && !document.hidden) {art.style.backgroundImage = 'url("' + item.image.replace(/"/g, '%22') + '")';onImage(image);}
      };
      image.onerror = function () {if (token === generation) art.style.backgroundImage = '';};
      image.src = item.image;
    }};
  }
  return {create:create};
})();
