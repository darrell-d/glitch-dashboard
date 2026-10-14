const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { appearance, description, icon, iconUrl, slug, styleForWeek } = require('../public/weather.js');

test('day/night imagery uses sun and moon for clear and partly cloudy skies', () => {
  assert.equal(appearance(0, true), 'sun');
  assert.equal(appearance(0, false), 'moon');
  assert.equal(appearance(2, true), 'partly-day');
  assert.equal(appearance(2, false), 'partly-night');
});

test('condition families select the correct artwork including unknown states', () => {
  for (const [code, kind] of [[3, 'cloud'], [45, 'fog'], [51, 'rain'], [61, 'rain'], [82, 'rain'],
    [73, 'snow'], [86, 'snow'], [95, 'storm'], [99, 'storm'], [999, 'unknown']]) {
    assert.equal(appearance(code), kind);
  }
  assert.equal(description(999), 'Conditions unavailable');
});

test('weather conditions map to accessible Meteocons images', () => {
  for (const code of [0, 1, 2, 3, 45, 51, 61, 71, 95, 999]) {
    for (const day of [true, false]) {
      assert.match(icon(code, day), /aria-hidden="true"/);
      assert.match(icon(code, day), /<img /);
      assert.match(iconUrl(code, day), /^\/meteocons\/fill\//);
    }
  }
  assert.equal(slug(0, false), 'clear-night');
  assert.equal(slug(2, true), 'partly-cloudy-day');
  assert.equal(slug(95, false), 'thunderstorms-night-rain');
  for (const style of ['fill', 'flat', 'line', 'monochrome']) {
    for (const name of ['clear-day', 'clear-night', 'partly-cloudy-day', 'partly-cloudy-night',
      'overcast', 'fog-day', 'fog-night', 'rain', 'snow', 'thunderstorms-day-rain',
      'thunderstorms-night-rain', 'not-available']) {
      assert.ok(fs.existsSync(path.join(__dirname, `../public/meteocons/${style}/${name}.svg`)));
    }
  }
});

test('automatic icon style changes weekly and repeats every four weeks', () => {
  const weeks = ['2025-12-22T12:00:00Z', '2025-12-29T12:00:00Z', '2026-01-05T12:00:00Z',
    '2026-01-12T12:00:00Z', '2026-01-19T12:00:00Z'].map((stamp) => styleForWeek(new Date(stamp)));
  assert.equal(new Set(weeks.slice(0, 4)).size, 4);
  assert.equal(weeks[4], weeks[0]);
});
