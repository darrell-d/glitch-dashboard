const test = require('node:test');
const assert = require('node:assert/strict');
const MoonPhase = require('../public/moon.js');
const { astronomy, items, alertIcon } = require('../public/signals.js');

// Philadelphia, Oct 14-15 2026 (EDT, UTC-4).
const place = { latitude: 39.95, longitude: -75.16 };
const weather = { utc_offset_seconds: -14400, current: { uv_index: 0 }, daily: {
  time: ['2026-10-14', '2026-10-15', '2026-10-16'],
  sunrise: ['2026-10-14T07:10', '2026-10-15T07:11', '2026-10-16T07:12'],
  sunset: ['2026-10-14T18:22', '2026-10-15T18:21', '2026-10-16T18:19'] } };
const at = (local) => Date.parse(`${local}-04:00`);
const show = (local, data = weather) => astronomy(at(local), data, place, MoonPhase);

test('a quiet day moves from sunrise to sunset to the moon', () => {
  assert.equal(show('2026-10-14T03:00:00').kind, 'moon');
  const sunrise = show('2026-10-14T04:45:00');
  assert.equal(sunrise.kind, 'sunrise');
  assert.equal(sunrise.detail, 'in 2 hr 25 min');
  assert.equal(show('2026-10-14T12:00:00').kind, 'sunset');
  assert.equal(show('2026-10-14T18:21:00').detail, 'in 1 min');
  // This crescent rose late morning, so after sunset the phase shows.
  const night = show('2026-10-14T21:00:00');
  assert.equal(night.kind, 'moon');
  assert.equal(night.title, 'Waxing crescent');
  assert.equal(night.icon, 'moon-waxing-crescent');
});

test('after sunset an upcoming moonrise shows until it passes', () => {
  const late = { ...weather, daily: { time: ['2026-10-26', '2026-10-27', '2026-10-28'],
    sunrise: ['2026-10-26T07:22', '2026-10-27T07:23', '2026-10-28T07:24'],
    sunset: ['2026-10-26T18:06', '2026-10-27T18:05', '2026-10-28T18:03'] } };
  // Full moon on Oct 26 rises right around sunset; the next evening it rises later.
  const rise = show('2026-10-27T18:10:00', late);
  assert.equal(rise.kind, 'moonrise');
  assert.ok(rise.time > at('2026-10-27T18:10:00') && rise.time < at('2026-10-27T20:30:00'));
  assert.equal(show('2026-10-27T22:00:00', late).kind, 'moon');
});

test('alerts replace the sky and rotate in severity order', () => {
  const now = at('2026-10-14T13:00:00');
  const busy = { ...weather, current: { uv_index: 6.6 }, air_quality: { us_aqi: 118 }, alerts: [
    { event: 'Red Flag Warning', severity: 'Severe', ends: '2026-10-14T20:00:00-04:00' },
    { event: 'Heat Advisory', severity: 'Moderate', ends: '2026-10-14T10:00:00-04:00' },
  ] };
  const list = items(now, busy, place, MoonPhase, 'America/New_York');
  assert.deepEqual(list.map((item) => item.icon), ['fire-alert', 'smoke', 'uv-index-7']);
  assert.equal(list[0].detail, 'Until 8 PM');
  assert.equal(list[1].detail, 'Unhealthy for sensitive groups');
  const quiet = items(now, { ...busy, current: { uv_index: 5.2 }, air_quality: { us_aqi: 82 }, alerts: [] },
    place, MoonPhase, 'America/New_York');
  assert.deepEqual(quiet.map((item) => item.kind), ['sunset']);
});

test('alert events map to matching icons', () => {
  assert.equal(alertIcon('Tornado Watch'), 'tornado-alert');
  assert.equal(alertIcon('Hurricane Warning'), 'hurricane-alert');
  assert.equal(alertIcon('Extreme Cold Warning'), 'thermometer-colder');
  assert.equal(alertIcon('Dense Smoke Advisory'), 'smoke');
  assert.equal(alertIcon('Special Weather Statement'), 'weather-alert');
});
