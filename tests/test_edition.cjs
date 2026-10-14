const test = require('node:test');
const assert = require('node:assert/strict');
const { createEdition } = require('../public/edition.js');

const stories = Array.from({ length: 5 }, (_, i) => ({ title: `Story ${i}`, url: `https://example.com/${i}` }));

test('rotation starts with three stories then weather, radar, and quote, with no headline list', () => {
  const screens = createEdition(stories);
  assert.deepEqual(screens.map((screen) => screen.panel), ['article', 'article', 'article', 'weather', 'radar', 'quote']);
  assert.deepEqual(screens.slice(0, 3).map((screen) => screen.item), stories.slice(0, 3));
});

test('the next batch wraps through the feed without duplicating a story in the same batch', () => {
  const screens = createEdition(stories, 3);
  assert.deepEqual(screens.slice(0, 3).map((screen) => screen.item.title), ['Story 3', 'Story 4', 'Story 0']);
  assert.equal(new Set(screens.slice(0, 3).map((screen) => screen.item.url)).size, 3);
});

test('a short feed produces only available article screens', () => {
  assert.deepEqual(createEdition(stories.slice(0, 1)).map((screen) => screen.panel), ['article', 'weather', 'radar', 'quote']);
  assert.deepEqual(createEdition([]).map((screen) => screen.panel), ['news', 'weather', 'radar', 'quote']);
});

test('feed refresh does not change the current edition snapshot', () => {
  const original = stories.map((item) => ({ ...item }));
  const edition = createEdition(original);
  original.reverse();
  original[2].title = 'Updated headline';
  assert.equal(edition[2].item.title, 'Story 2');
});
