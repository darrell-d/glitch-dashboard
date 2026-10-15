const test = require('node:test');
const assert = require('node:assert/strict');
const MoonPhase = require('../public/moon.js');
const WeatherVisual = require('../public/weather.js');
const { astronomy, items, alertIcon, wind } = require('../public/signals.js');

// Philadelphia, Oct 14-15 2026 (EDT, UTC-4).
const place = { latitude: 39.95, longitude: -75.16 };
const weather = { utc_offset_seconds: -14400, current: { uv_index: 0, wind_speed_10m: 4, wind_direction_10m: 270 }, daily: {
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

test('wind, alerts, and the sky share the carousel in severity order', () => {
  const now = at('2026-10-14T13:00:00');
  const busy = { ...weather, current: { ...weather.current, uv_index: 6.6 }, air_quality: { us_aqi: 118 }, alerts: [
    { event: 'Red Flag Warning', severity: 'Severe', ends: '2026-10-14T20:00:00-04:00' },
    { event: 'Heat Advisory', severity: 'Moderate', ends: '2026-10-14T10:00:00-04:00' },
  ] };
  const list = items(now, busy, place, MoonPhase, 'America/New_York', WeatherVisual, 'seed');
  assert.deepEqual(list.map((item) => item.kind), ['wind', 'alert', 'alert', 'alert', 'sunset']);
  assert.equal(list[1].detail, 'Until 8 PM');
  assert.equal(list[2].detail, 'Unhealthy for sensitive groups');
  const quiet = items(now, { ...busy, current: { ...busy.current, uv_index: 5.2 }, air_quality: { us_aqi: 82 }, alerts: [] },
    place, MoonPhase, 'America/New_York', WeatherVisual, 'seed');
  assert.deepEqual(quiet.map((item) => item.kind), ['wind', 'sunset']);
});

test('wind always joins the astronomy item with strength and direction icons', () => {
  const item = wind(weather, WeatherVisual, '19103:10/14/2026');
  assert.equal(item.kind, 'wind');
  assert.equal(item.title, 'Wind · 4 mph');
  assert.equal(item.detail, 'West');
  assert.equal(item.icons.length, 2);
  assert.ok(['windsock-calm', 'windsock-weak', 'wind-spinner', 'windmill'].includes(item.icons[0]));
  assert.equal(item.icons[1], 'wind-direction-w');
  const list = items(at('2026-10-14T21:00:00'), weather, place, MoonPhase, 'America/New_York',
    WeatherVisual, 'seed');
  assert.deepEqual(list.map((entry) => entry.kind), ['wind', 'moon']);
});

test('alert events map to matching icons', () => {
  assert.equal(alertIcon('Tornado Watch'), 'tornado-alert');
  assert.equal(alertIcon('Hurricane Warning'), 'hurricane-alert');
  assert.equal(alertIcon('Extreme Cold Warning'), 'thermometer-colder');
  assert.equal(alertIcon('Dense Smoke Advisory'), 'smoke');
  assert.equal(alertIcon('Special Weather Statement'), 'weather-alert');
});
