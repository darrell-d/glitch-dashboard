const test = require('node:test');
const assert = require('node:assert/strict');
const { createEdition } = require('../public/edition.js');

const stories = Array.from({ length: 5 }, (_, i) => ({ title: `Story ${i}`, url: `https://example.com/${i}` }));

test('each overview is followed by exactly its article pages, then weather and quote', () => {
  const screens = createEdition(stories);
  assert.deepEqual(screens.map((screen) => screen.panel), ['news', 'article', 'article', 'article', 'weather', 'quote']);
  assert.deepEqual(screens.slice(1, 4).map((screen) => screen.item), screens[0].items);
});

test('the next batch wraps through the feed without duplicating a story in the same overview', () => {
  const screens = createEdition(stories, 3);
  assert.deepEqual(screens[0].items.map((item) => item.title), ['Story 3', 'Story 4', 'Story 0']);
  assert.equal(new Set(screens[0].items.map((item) => item.url)).size, 3);
});

test('a short feed produces only available article screens', () => {
  assert.deepEqual(createEdition(stories.slice(0, 1)).map((screen) => screen.panel), ['news', 'article', 'weather', 'quote']);
  assert.deepEqual(createEdition([]).map((screen) => screen.panel), ['news', 'weather', 'quote']);
});

test('feed refresh does not change the current edition snapshot', () => {
  const original = stories.map((item) => ({ ...item }));
  const edition = createEdition(original);
  original.reverse();
  original[2].title = 'Updated headline';
  assert.equal(edition[0].items[2].title, 'Story 2');
  assert.equal(edition[3].item.title, 'Story 2');
});
