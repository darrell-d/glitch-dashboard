const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { appearance, description, icon } = require('../public/weather.js');

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

test('every rendered weather icon has a locally supplied SVG symbol', () => {
  const svg = fs.readFileSync(path.join(__dirname, '../public/weather-symbols.svg'), 'utf8');
  for (const code of [0, 1, 2, 3, 45, 51, 61, 71, 95, 999]) {
    for (const day of [true, false]) {
      assert.ok(svg.includes(`id="${appearance(code, day)}"`));
      assert.match(icon(code, day), /aria-hidden="true"/);
    }
  }
});
