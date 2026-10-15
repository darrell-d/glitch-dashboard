/* Weighted, guarded rotation planning and content-pool cycling. */
(function (root) {
  'use strict';

  const ROTATION_SIZE = 20;
  const DEFAULT_WEIGHTS = { article: 50, weather: 20, radar: 10, markets: 4, quote: 4,
    gallery: 4, picture: 3, cartoon: 3, media: 2 };
  const DEFAULT_GUARDS = { maxNewsGap: 3, maxWeatherGap: 6 };

  function shuffle(items, random = Math.random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function unique(items) {
    return items.filter((item, i) => items.findIndex((other) => other.url === item.url) === i);
  }

  // Pull from a changing feed without repeating until its currently available pool is exhausted.
  function pickCycle(items, shown = new Set(), size = 1) {
    const pool = unique(items);
    const current = new Set(pool.map((item) => item.url));
    let next = new Set([...shown].filter((url) => current.has(url)));
    let round = new Set();
    const picked = [];
    while (picked.length < size && pool.length) {
      let available = pool.filter((item) => !next.has(item.url) && !round.has(item.url));
      if (!available.length) {
        if (next.size >= pool.length) next = new Set();
        available = pool.filter((item) => !next.has(item.url) && !round.has(item.url));
      }
      if (!available.length) {
        round = new Set();
        available = pool.filter((item) => !next.has(item.url));
      }
      const item = available[0];
      picked.push({ ...item });
      next.add(item.url);
      round.add(item.url);
    }
    return { items: picked, shown: next };
  }

  const pickStories = pickCycle;

  function weightedChoice(kinds, weights, random) {
    const total = kinds.reduce((sum, kind) => sum + weights[kind], 0);
    let draw = random() * total;
    for (const kind of kinds) {
      draw -= weights[kind];
      if (draw < 0) return kind;
    }
    return kinds[kinds.length - 1];
  }

  function createSchedule({ weights = DEFAULT_WEIGHTS, maxNewsGap = DEFAULT_GUARDS.maxNewsGap,
    maxWeatherGap = DEFAULT_GUARDS.maxWeatherGap, availability = {}, length = ROTATION_SIZE,
    state = {}, random = Math.random } = {}) {
    const active = Object.keys(DEFAULT_WEIGHTS).filter((kind) => weights[kind] > 0 && availability[kind] !== false);
    if (!active.length) return { kinds: ['news'], state: { lastKind: 'news', newsGap: 0, weatherGap: 0 } };
    let lastKind = state.lastKind || '';
    let newsGap = Number.isInteger(state.newsGap) ? state.newsGap : 0;
    let weatherGap = Number.isInteger(state.weatherGap) ? state.weatherGap : 0;
    const kinds = [];
    while (kinds.length < length) {
      let candidates = active.filter((kind) => kind !== lastKind);
      if (!candidates.length) candidates = active;
      const newsDue = newsGap >= maxNewsGap && candidates.includes('article');
      const weatherCandidates = candidates.filter((kind) => ['weather', 'radar'].includes(kind));
      const weatherDue = weatherGap >= maxWeatherGap && weatherCandidates.length;
      let eligible = candidates;
      if (newsDue && weatherDue) eligible = newsGap / maxNewsGap >= weatherGap / maxWeatherGap
        ? ['article'] : weatherCandidates;
      else if (newsDue) eligible = ['article'];
      else if (weatherDue) eligible = weatherCandidates;
      else if (newsGap >= maxNewsGap - 1 && weatherGap >= maxWeatherGap - 1 && candidates.includes('article')) {
        // Avoid both guarantees becoming due on the same draw; weather will be due next.
        eligible = ['article'];
      }
      const kind = weightedChoice(eligible, weights, random);
      kinds.push(kind);
      lastKind = kind;
      newsGap = kind === 'article' ? 0 : newsGap + 1;
      weatherGap = ['weather', 'radar'].includes(kind) ? 0 : weatherGap + 1;
    }
    return { kinds, state: { lastKind, newsGap, weatherGap } };
  }

  function createEdition(stories, { schedule = [], pictures = [], cartoons = [], media = [] } = {}) {
    const queues = { article: [...stories], picture: [...pictures], cartoon: [...cartoons], media: [...media] };
    const counts = Object.fromEntries(Object.keys(queues).map((kind) => [kind, queues[kind].length]));
    return schedule.map((kind) => {
      if (kind === 'article') return { panel: 'article', kind, item: queues.article.shift(),
        index: counts.article - queues.article.length - 1, count: counts.article };
      if (kind === 'picture' || kind === 'cartoon') return { panel: 'picture', kind, item: queues[kind].shift() };
      if (kind === 'media') return { panel: 'media', kind, item: queues.media.shift() };
      return { panel: kind, kind };
    });
  }

  const api = { ROTATION_SIZE, DEFAULT_WEIGHTS, DEFAULT_GUARDS, pickCycle, pickStories, shuffle,
    createSchedule, createEdition };
  if (typeof module !== 'undefined') module.exports = api;
  else root.DashboardEdition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
