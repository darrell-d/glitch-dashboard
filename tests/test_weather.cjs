const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { appearance, description, icon, iconUrl, safeColor, slug, styleForWeek,
  windDirection, windStrengthIcon } = require('../public/weather.js');

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

test('monochrome icons accept a safe custom color', () => {
  assert.match(icon(0, true, 'monochrome', '#c6f294'), /style="color:#c6f294;/);
  assert.match(icon(0, true, 'monochrome', 'red;display:none'), /style="color:#dce7d6;/);
  assert.equal(safeColor('#ABCDEF'), '#ABCDEF');
  assert.equal(safeColor('not-a-color'), '#dce7d6');
});

test('wind direction selects the nearest Meteocons compass point', () => {
  assert.equal(windDirection(0), 'n');
  assert.equal(windDirection(44), 'ne');
  assert.equal(windDirection(181), 's');
  assert.equal(windDirection(359), 'n');
  assert.equal(windDirection(-45), 'nw');
  assert.equal(windDirection(null), null);
});

test('wind strength selects stable icons for weak, moderate, and very windy conditions', () => {
  const weak = ['windsock-calm', 'windsock-weak', 'wind-spinner', 'windmill'];
  assert.ok(weak.includes(windStrengthIcon(4, '19103:10/14/2026')));
  assert.equal(windStrengthIcon(4, '19103:10/14/2026'), windStrengthIcon(4, '19103:10/14/2026'));
  assert.equal(windStrengthIcon(12, 'seed'), 'windsock-moderate');
  assert.equal(windStrengthIcon(24, 'seed'), 'windsock-moderate');
  assert.ok(['windsock', 'wind'].includes(windStrengthIcon(25, 'seed')));
  for (const style of ['fill', 'flat', 'line', 'monochrome']) {
    for (const name of [...weak, 'windsock-moderate', 'windsock', 'wind',
      ...['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((point) => `wind-direction-${point}`)]) {
      assert.ok(fs.existsSync(path.join(__dirname, `../public/meteocons/${style}/${name}.svg`)));
    }
  }
});
