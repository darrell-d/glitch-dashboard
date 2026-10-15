const test = require('node:test');
const assert = require('node:assert/strict');
const { createEdition, pickStories, shuffle } = require('../public/edition.js');

const story = (i) => ({ title: `Story ${i}`, url: `https://example.com/${i}` });
const stories = Array.from({ length: 5 }, (_, i) => story(i));
const titles = (items) => items.map((item) => item.title);

test('rotation starts with three stories then weather, radar, and quote, with no headline list', () => {
  const screens = createEdition(pickStories(stories).items);
  assert.deepEqual(screens.map((screen) => screen.panel), ['article', 'article', 'article', 'weather', 'radar', 'markets', 'quote']);
  assert.deepEqual(screens.slice(0, 3).map((screen) => screen.item), stories.slice(0, 3));
});

test('batches continue with unshown stories, then restart the cycle without repeating within a batch', () => {
  const first = pickStories(stories);
  const second = pickStories(stories, first.shown);
  assert.deepEqual(titles(second.items), ['Story 3', 'Story 4', 'Story 0']);
  assert.deepEqual([...second.shown], stories.slice(3).concat(stories[0]).map((item) => item.url));
  const third = pickStories(stories, second.shown);
  assert.deepEqual(titles(third.items), ['Story 1', 'Story 2', 'Story 0']);
});

test('a newly published story goes into the very next batch and shown stories do not repeat', () => {
  const first = pickStories(stories);
  // Story 9 takes the top spot and pushes earlier stories down the feed.
  const refreshed = [story(9), ...stories];
  const next = pickStories(refreshed, first.shown);
  assert.deepEqual(titles(next.items), ['Story 9', 'Story 3', 'Story 4']);
});

test('stories that leave the feed are forgotten', () => {
  const first = pickStories(stories);
  const next = pickStories(stories.slice(2), first.shown);
  assert.deepEqual([...next.shown].sort(), stories.slice(2).map((item) => item.url).sort());
});

test('the photo wall follows the quote when the feed has photos', () => {
  const screens = createEdition(pickStories(stories).items, { gallery: true });
  assert.deepEqual(screens.slice(3).map((screen) => screen.panel), ['weather', 'radar', 'markets', 'quote', 'gallery']);
});

test('pictures land in random gaps, never first and never back to back', () => {
  const pictures = [{ url: 'p1' }, { url: 'p2' }, { url: 'p3' }];
  for (let seed = 0; seed < 50; seed += 1) {
    let state = seed + 1;
    const random = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
    const panels = createEdition(pickStories(stories).items, { gallery: true, pictures, random }).map((screen) => screen.panel);
    assert.equal(panels.filter((panel) => panel === 'picture').length, 3);
    assert.notEqual(panels[0], 'picture');
    assert.ok(panels.every((panel, i) => !(panel === 'picture' && panels[i + 1] === 'picture')), panels.join());
    assert.deepEqual(panels.filter((panel) => panel !== 'picture'), ['article', 'article', 'article', 'weather', 'radar', 'markets', 'quote', 'gallery']);
  }
});

test('featured video uses its own non-adjacent full-screen slot', () => {
  const pictures = [{ url: 'p1' }, { url: 'p2' }, { url: 'p3' }];
  const media = [{ url: 'v1', poster: 'poster' }];
  for (let seed = 0; seed < 30; seed += 1) {
    let state = seed + 1;
    const random = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
    const panels = createEdition(pickStories(stories).items, { gallery: true, pictures, media, random }).map((screen) => screen.panel);
    assert.equal(panels.filter((panel) => panel === 'media').length, 1);
    assert.notEqual(panels[0], 'media');
    assert.ok(panels.every((panel, i) => !(['picture', 'media'].includes(panel) && ['picture', 'media'].includes(panels[i + 1]))), panels.join());
  }
});

test('shuffle keeps every item', () => {
  assert.deepEqual(shuffle(stories).map((item) => item.url).sort(), stories.map((item) => item.url).sort());
});

test('a short feed produces only available article screens', () => {
  assert.deepEqual(createEdition(pickStories(stories.slice(0, 1)).items).map((screen) => screen.panel), ['article', 'weather', 'radar', 'markets', 'quote']);
  assert.deepEqual(createEdition(pickStories([]).items).map((screen) => screen.panel), ['news', 'weather', 'radar', 'markets', 'quote']);
});

test('feed refresh does not change the current edition snapshot', () => {
  const original = stories.map((item) => ({ ...item }));
  const edition = createEdition(pickStories(original).items);
  original.reverse();
  original[2].title = 'Updated headline';
  assert.equal(edition[2].item.title, 'Story 2');
});
