/* A fixed batch keeps article pages aligned with the overview during refresh. */
(function (root) {
  'use strict';
  function createEdition(items, offset = 0) {
    const selected = Array.from({ length: Math.min(3, items.length) }, (_, i) =>
      ({ ...items[((offset + i) % items.length + items.length) % items.length] }));
    return [{ panel: 'news', items: selected },
      ...selected.map((item, index) => ({ panel: 'article', item, index, count: selected.length })),
      { panel: 'weather' }, { panel: 'quote' }];
  }
  if (typeof module !== 'undefined') module.exports = { createEdition };
  else root.DashboardEdition = { createEdition };
})(typeof globalThis !== 'undefined' ? globalThis : this);
