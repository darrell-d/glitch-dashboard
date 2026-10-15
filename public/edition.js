/* A fixed batch prevents feed refresh from replacing a story during display. */
(function (root) {
  'use strict';
  const BATCH_SIZE = 3;
  const PICTURES_PER_BATCH = 3;
  const MEDIA_PER_BATCH = 1;
  const CARTOONS_PER_BATCH = 1;

  // Next stories to show: unshown stories in feed order, so a new story at the top of
  // a feed joins the very next batch. Once everything has been shown, the cycle restarts.
  function pickStories(items, shown = new Set(), size = BATCH_SIZE) {
    const unique = items.filter((item, i) => items.findIndex((other) => other.url === item.url) === i);
    const current = new Set(unique.map((item) => item.url));
    let next = new Set([...shown].filter((url) => current.has(url)));
    let picked = unique.filter((item) => !next.has(item.url)).slice(0, size);
    if (picked.length < size) {
      next = new Set();
      picked = [...picked, ...unique.filter((item) => !picked.includes(item)).slice(0, size - picked.length)];
    }
    picked.forEach((item) => next.add(item.url));
    return { items: picked.map((item) => ({ ...item })), shown: next };
  }

  function shuffle(items, random = Math.random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function createEdition(stories, { gallery = false, pictures = [], media = [], cartoons = [], random = Math.random } = {}) {
    const selected = stories.slice(0, BATCH_SIZE).map((item) => ({ ...item }));
    const screens = [...(selected.length ? selected.map((item, index) => ({ panel: 'article', item, index, count: selected.length })) : [{ panel: 'news' }]),
      { panel: 'weather' }, { panel: 'radar' }, { panel: 'markets' }, { panel: 'quote' }, ...(gallery ? [{ panel: 'gallery' }] : [])];
    // Each picture takes its own random gap after a regular screen, so two never run back to back
    // and a batch never opens with one (the previous batch may have just ended with a picture).
    const extras = shuffle([
      ...pictures.map((item) => ({ panel: 'picture', item: { ...item } })),
      ...media.map((item) => ({ panel: 'media', item: { ...item } })),
      ...cartoons.map((item) => ({ panel: 'picture', item: { ...item } })),
    ], random);
    const gaps = shuffle(screens.map((_, i) => i + 1), random).slice(0, extras.length).sort((a, b) => b - a);
    gaps.forEach((gap, i) => screens.splice(gap, 0, extras[i]));
    return screens;
  }
  const api = { BATCH_SIZE, PICTURES_PER_BATCH, MEDIA_PER_BATCH, CARTOONS_PER_BATCH, pickStories, shuffle, createEdition };
  if (typeof module !== 'undefined') module.exports = api;
  else root.DashboardEdition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
