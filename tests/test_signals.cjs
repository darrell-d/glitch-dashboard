const test = require('node:test');
const assert = require('node:assert/strict');
const MoonPhase = require('../public/moon.js');
const WeatherVisual = require('../public/weather.js');
const { nextSkyEvent, tickerItems, alertIcon, wind } = require('../public/signals.js');

// Philadelphia, Oct 14-15 2026 (EDT, UTC-4).
const place = { latitude: 39.95, longitude: -75.16 };
const weather = { utc_offset_seconds: -14400, current: { uv_index: 0, wind_speed_10m: 4, wind_direction_10m: 270 }, daily: {
  time: ['2026-10-14', '2026-10-15', '2026-10-16'],
  sunrise: ['2026-10-14T07:10', '2026-10-15T07:11', '2026-10-16T07:12'],
  sunset: ['2026-10-14T18:22', '2026-10-15T18:21', '2026-10-16T18:19'] } };
const at = (local) => Date.parse(`${local}-04:00`);
const show = (local, data = weather) => nextSkyEvent(at(local), data, place, MoonPhase);

test('the sky item is always the next sunrise, sunset, or moonrise in time order', () => {
  // Oct 14: sunrise 7:10, moonrise ~11:31 AM (waxing crescent), sunset 6:22 PM.
  const late = show('2026-10-14T03:00:00');
  assert.equal(late.kind, 'sunrise');
  assert.equal(late.detail, 'in 4 hr 10 min');
  assert.equal(show('2026-10-14T09:00:00').kind, 'moonrise');
  assert.equal(show('2026-10-14T12:00:00').kind, 'sunset');
  assert.equal(show('2026-10-14T18:21:00').detail, 'in 1 min');
  // After sunset the moon has already risen, so the next event is tomorrow's sunrise.
  assert.equal(show('2026-10-14T23:43:00').kind, 'sunrise');
});

test('a moonrise after sunset comes before the next sunrise', () => {
  const late = { ...weather, daily: { time: ['2026-10-26', '2026-10-27', '2026-10-28'],
    sunrise: ['2026-10-26T07:22', '2026-10-27T07:23', '2026-10-28T07:24'],
    sunset: ['2026-10-26T18:06', '2026-10-27T18:05', '2026-10-28T18:03'] } };
  const rise = show('2026-10-27T18:10:00', late);
  assert.equal(rise.kind, 'moonrise');
  assert.ok(rise.time > at('2026-10-27T18:10:00') && rise.time < at('2026-10-27T20:30:00'));
  assert.equal(show('2026-10-27T22:00:00', late).kind, 'sunrise');
});

test('the ticker always includes the next rise or set, marking tomorrow', () => {
  const night = tickerItems(at('2026-10-14T23:43:00'), weather, place, MoonPhase, 'America/New_York', WeatherVisual);
  const sky = night.find((item) => item.kind === 'sunrise');
  assert.deepEqual([sky.kicker, sky.title, sky.sub], ['Sun', 'Sunrise tomorrow 7:11 AM', 'in 7 hr 28 min']);
});

test('ticker puts warnings first, then air quality, the sky event, wind, and the moon', () => {
  const now = at('2026-10-14T13:00:00');
  const busy = { ...weather, current: { ...weather.current, uv_index: 6.6 }, air_quality: { us_aqi: 118 }, alerts: [
    { event: 'Red Flag Warning', severity: 'Severe', ends: '2026-10-14T20:00:00-04:00' },
    { event: 'Heat Advisory', severity: 'Moderate', ends: '2026-10-14T10:00:00-04:00' },
  ] };
  const list = tickerItems(now, busy, place, MoonPhase, 'America/New_York', WeatherVisual, 'seed');
  assert.deepEqual(list.map((item) => item.kind), ['alert', 'alert', 'air', 'sunset', 'wind', 'moon']);
  assert.deepEqual([list[0].kicker, list[0].title, list[0].sub], ['Alert · NWS', 'Red Flag Warning', 'Until 8 PM']);
  assert.deepEqual([list[1].kicker, list[1].title], ['UV index', '7 · High']);
  assert.deepEqual([list[2].title, list[2].icon, list[2].severity], ['AQI 118 · Unhealthy for sensitive groups', 'code-orange', 'Moderate']);
  assert.deepEqual([list[3].kicker, list[3].title], ['Sun', 'Sunset 6:22 PM']);
  // A quiet day still always shows air quality, wind, and the moon.
  const quiet = tickerItems(now, { ...busy, current: { ...busy.current, uv_index: 5.2 }, air_quality: { us_aqi: 32 }, alerts: [] },
    place, MoonPhase, 'America/New_York', WeatherVisual, 'seed');
  assert.deepEqual(quiet.map((item) => [item.kind, item.icon]), [['air', 'code-green'], ['sunset', 'sunset'], ['wind', 'wind-direction-w'], ['moon', 'moon-waxing-crescent']]);
  assert.equal(quiet[0].title, 'AQI 32 · Good');
});

test('wind shows speed and the direction it blows from', () => {
  const item = wind(weather, WeatherVisual, '19103:10/14/2026');
  assert.deepEqual([item.kind, item.kicker, item.title, item.icon], ['wind', 'Wind', '4 mph · West', 'wind-direction-w']);
  assert.ok(['windsock-calm', 'windsock-weak', 'wind-spinner', 'windmill'].includes(item.trail), 'light wind strength icon follows the text');
  assert.equal(wind({ current: { wind_speed_10m: 18, wind_direction_10m: 0 } }, WeatherVisual).trail, 'windsock-moderate');
  assert.ok(['windsock', 'wind'].includes(wind({ current: { wind_speed_10m: 30, wind_direction_10m: 0 } }, WeatherVisual, 's').trail));
  const calm = wind({ current: { wind_speed_10m: 3 } }, WeatherVisual, 'seed');
  assert.ok(['windsock-calm', 'windsock-weak', 'wind-spinner', 'windmill'].includes(calm.icon));
  assert.equal(calm.trail, '');
});

test('the moon says when it rises next, or that it is up', () => {
  const night = tickerItems(at('2026-10-14T21:00:00'), weather, place, MoonPhase, 'America/New_York', WeatherVisual);
  const moon = night.find((item) => item.kind === 'moon');
  assert.match(moon.sub, /^Rises tomorrow \d{1,2}:\d{2} [AP]M$/);
  const noon = tickerItems(at('2026-10-14T13:00:00'), weather, place, MoonPhase, 'America/New_York', WeatherVisual);
  assert.equal(noon.find((item) => item.kind === 'moon').sub, 'Up now');
});

test('alert events map to matching icons', () => {
  assert.equal(alertIcon('Tornado Watch'), 'tornado-alert');
  assert.equal(alertIcon('Hurricane Warning'), 'hurricane-alert');
  assert.equal(alertIcon('Extreme Cold Warning'), 'thermometer-colder');
  assert.equal(alertIcon('Dense Smoke Advisory'), 'smoke');
  assert.equal(alertIcon('Special Weather Statement'), 'weather-alert');
});
