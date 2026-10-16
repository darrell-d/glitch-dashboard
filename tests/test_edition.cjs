const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_WEIGHTS, createEdition, createSchedule, pickCycle, pickStories, shuffle } = require('../public/edition.js');

const story = (i) => ({ title: `Story ${i}`, url: `https://example.com/${i}` });
const stories = Array.from({ length: 5 }, (_, i) => story(i));
const titles = (items) => items.map((item) => item.title);

test('content pools are exhausted before an item repeats', () => {
  const picked = pickCycle(stories.slice(0, 3), new Set(), 7);
  assert.deepEqual(titles(picked.items), ['Story 0', 'Story 1', 'Story 2', 'Story 0', 'Story 1', 'Story 2', 'Story 0']);
});

test('new feed entries are shown before the existing cycle resumes', () => {
  const first = pickStories(stories, new Set(), 3);
  const refreshed = [story(9), ...stories];
  const next = pickStories(refreshed, first.shown, 3);
  assert.deepEqual(titles(next.items), ['Story 9', 'Story 3', 'Story 4']);
});

test('stories that leave the feed are forgotten', () => {
  const first = pickStories(stories, new Set(), 3);
  const next = pickStories(stories.slice(2), first.shown, 2);
  assert.deepEqual([...next.shown].sort(), stories.slice(2).map((item) => item.url).sort());
});

test('weighted schedules favor news and weather while enforcing gaps and type cooldowns', () => {
  let seed = 47;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let state = {};
  const kinds = [];
  for (let i = 0; i < 100; i += 1) {
    const schedule = createSchedule({ state, random });
    kinds.push(...schedule.kinds);
    state = schedule.state;
  }
  assert.ok(kinds.every((kind, i) => i === 0 || kind !== kinds[i - 1]));
  let newsGap = 0;
  let weatherGap = 0;
  for (const kind of kinds) {
    newsGap = kind === 'article' ? 0 : newsGap + 1;
    weatherGap = ['weather', 'radar'].includes(kind) ? 0 : weatherGap + 1;
    assert.ok(newsGap <= 3, `news gap reached ${newsGap}`);
    assert.ok(weatherGap <= 6, `weather gap reached ${weatherGap}`);
  }
  const counts = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((kind) =>
    [kind, kinds.filter((item) => item === kind).length]));
  assert.ok(counts.article > counts.weather + counts.radar);
  assert.ok(counts.weather > counts.radar);
  assert.ok(counts.markets > 0 && counts.quote > 0 && counts.media > 0);
});

test('zero-weight and unavailable screens are omitted', () => {
  const weights = { ...DEFAULT_WEIGHTS, markets: 0 };
  const schedule = createSchedule({ weights, availability: { gallery: false, media: false }, random: () => 0.5 });
  assert.ok(!schedule.kinds.includes('markets'));
  assert.ok(!schedule.kinds.includes('gallery'));
  assert.ok(!schedule.kinds.includes('media'));
});

test('edition maps scheduled content kinds to their display panels', () => {
  const schedule = ['article', 'weather', 'cartoon', 'radar', 'picture', 'media', 'lawnmower', 'quote'];
  const edition = createEdition([story(1)], { schedule, pictures: [{ url: 'p1' }],
    cartoons: [{ url: 'c1' }], media: [{ url: 'v1' }] });
  assert.deepEqual(edition.map((screen) => screen.panel),
    ['article', 'weather', 'picture', 'radar', 'picture', 'media', 'lawnmower', 'quote']);
  assert.deepEqual(edition.map((screen) => screen.kind), schedule);
  assert.equal(edition[2].item.url, 'c1');
});

test('shuffle keeps every item', () => {
  assert.deepEqual(shuffle(stories).map((item) => item.url).sort(), stories.map((item) => item.url).sort());
});

test('feed refresh does not change the current edition snapshot', () => {
  const original = stories.map((item) => ({ ...item }));
  const edition = createEdition(original.slice(0, 2), { schedule: ['article', 'weather', 'article'] });
  original.reverse();
  original[2].title = 'Updated headline';
  assert.equal(edition[2].item.title, 'Story 1');
});
