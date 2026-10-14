/* A fixed batch prevents feed refresh from replacing a story during display. */
(function (root) {
  'use strict';
  function createEdition(items, offset = 0) {
    const selected = Array.from({ length: Math.min(3, items.length) }, (_, i) =>
      ({ ...items[((offset + i) % items.length + items.length) % items.length] }));
    return [...(selected.length ? selected.map((item, index) => ({ panel: 'article', item, index, count: selected.length })) : [{ panel: 'news' }]),
      { panel: 'weather' }, { panel: 'quote' }];
  }
  if (typeof module !== 'undefined') module.exports = { createEdition };
  else root.DashboardEdition = { createEdition };
})(typeof globalThis !== 'undefined' ? globalThis : this);
