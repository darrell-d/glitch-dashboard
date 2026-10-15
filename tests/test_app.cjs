const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DashboardEdition = require('../public/edition.js');
const WeatherVisual = require('../public/weather.js');
const MoonPhase = require('../public/moon.js');
const WeatherSignals = require('../public/signals.js');
const RadarMap = require('../public/radar.js');

// Exercise the actual app's navigation/timer with a minimal DOM, without a browser.
class Element {
  constructor(tagName = 'DIV') {
    this.tagName = tagName;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.children = [];
    this.clientHeight = 800;
    this.scrollHeight = 0;
    this.open = false;
    this.classes = new Set();
    this.classList = { toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name),
      add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name) };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) { children.forEach((child) => { if (child && typeof child === 'object') child.parentElement = this; }); this.children.push(...children); }
  replaceChildren(...children) { this.children.forEach((child) => { if (child && typeof child === 'object') child.parentElement = null; }); this.children = []; this.append(...children); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  click() { this.listeners.click?.(); }
  showModal() { this.open = true; }
}

async function app(hash = '', { storyCount = 3, weather = null, settings = null, pictures = null } = {}) {
  const posts = [];
  const markup = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const elements = Object.fromEntries([...markup.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  const extras = { '.footer': new Element(), '.paper-story': new Element() };
  const listeners = {};
  const location = { hash };
  let now = 0;
  const frames = [];
  const transitionTimers = [];
  const items = Array.from({ length: storyCount }, (_, i) => ({ title: `Story ${i}`, description: `Description ${i}`,
    source: ['CNN', 'WIRED', 'Kotaku'][i % 3], source_updated_at: new Date().toISOString(), source_stale: i === 0,
    url: `https://example.com/${i}`, image_url: `https://example.com/${i}.jpg` }));
  const document = {
    body: new Element('BODY'), fullscreenEnabled: false,
    getElementById: (id) => { assert.ok(elements[id], `Unknown element ${id}`); return elements[id]; },
    createElement: (tag) => new Element(tag.toUpperCase()),
    querySelectorAll: () => [],
    querySelector: (selector) => extras[selector],
    addEventListener: (event, callback) => { listeners[event] = callback; },
  };
  const context = vm.createContext({ document, location, DashboardEdition, WeatherVisual, MoonPhase, WeatherSignals, RadarMap,
    window: { addEventListener() {} }, history: { replaceState: (_, __, hash) => { location.hash = hash; } },
    localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => now },
    getComputedStyle: () => ({ fontSize: '32px' }), requestAnimationFrame: (callback) => frames.push(callback),
    setInterval() {}, setTimeout(callback, delay) { if (delay === 800) transitionTimers.push(callback); }, clearTimeout() {}, AbortController, Image: class { },
    fetch: async (url, init = {}) => ({ ok: true, json: async () => {
      if (url === '/api/settings' && init.method === 'POST') { posts.push(JSON.parse(init.body)); return JSON.parse(init.body); }
      if (url === '/api/settings' && settings) return settings;
      if (url === '/api/pictures' && pictures) return { data: { photos: pictures }, updated_at: new Date().toISOString(), stale: false };
      if (url.startsWith('/api/config')) return { location: 'Philadelphia', region: 'Pennsylvania', postal_code: '19103', latitude: 39.95, longitude: -75.16, timezone: 'America/New_York' };
      if (url === '/api/news') return { data: { items }, updated_at: new Date().toISOString(), stale: false };
      if (url.startsWith('/api/weather') && weather) return { data: weather, updated_at: new Date().toISOString(), stale: false };
      if (url.startsWith('/api/radar')) return { data: { host: 'https://tilecache.rainviewer.com',
        location: { location: 'Philadelphia', region: 'Pennsylvania', postal_code: '19103', latitude: 39.95, longitude: -75.16 },
        frames: [{ time: 1791996000, path: '/v2/radar/abc123' }],
        cities: [{ name: 'Harrisburg', latitude: 40.27, longitude: -76.89, temperature: 69 }] },
        updated_at: new Date().toISOString(), stale: false };
      throw new Error('Other feed offline');
    } }),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'), context);
  await new Promise(setImmediate);
  return { elements, extras, location, listeners, posts,
    run: (code) => vm.runInContext(code, context), advance: (milliseconds) => { now += milliseconds; vm.runInContext('tick()', context); },
    frame: (milliseconds) => { now += milliseconds; const pending = frames.splice(0); pending.forEach((callback) => callback()); },
    finishTransitions: () => transitionTimers.splice(0).forEach((callback) => callback()) };
}

test('stories appear immediately and automatic rotation advances to the next story', async () => {
  const screen = await app();
  assert.equal(screen.elements['article-title'].textContent, 'Story 0');
  screen.advance(31000);
  assert.equal(screen.elements.article.classList.contains('active'), true);
  assert.equal(screen.elements['article-title'].textContent, 'Story 1');
  assert.equal(screen.extras['.footer'].inert, true);
  assert.equal(screen.location.hash, '#article');
});

test('the photo wall stays up five minutes by default', async () => {
  const screen = await app('', { storyCount: 6 });
  screen.run("showPanel(screens.findIndex((item) => item.panel === 'gallery'))");
  assert.equal(screen.elements.gallery.classList.contains('active'), true);
  screen.advance(299000);
  assert.equal(screen.elements.gallery.classList.contains('active'), true);
  assert.equal(screen.elements.countdown.textContent, '');
  screen.advance(2000);
  assert.equal(screen.elements.gallery.classList.contains('active'), false);
  assert.equal(screen.elements.article.classList.contains('active'), true);
});

test('screen times come from the server and are saved from the settings tab', async () => {
  const screen = await app('', { settings: { screen_durations: { article: 10, weather: 30, radar: 30, markets: 60, quote: 30, gallery: 300 } } });
  assert.equal(screen.elements.article.classList.contains('active'), true);
  screen.advance(11000);
  assert.equal(screen.elements['article-title'].textContent, 'Story 1');
  screen.elements.settings.click();
  assert.equal(screen.elements['time-markets'].value, 60);
  assert.equal(screen.elements['settings-panel-times'].hidden, true);
  screen.elements['settings-tab-times'].click();
  assert.equal(screen.elements['settings-panel-times'].hidden, false);
  assert.equal(screen.elements['settings-tab-times'].attributes['aria-selected'], 'true');
  screen.elements['time-article'].value = '45';
  screen.elements['settings-dialog'].returnValue = 'save';
  await screen.elements['settings-dialog'].listeners.close();
  assert.equal(screen.posts.length, 1);
  assert.equal(screen.posts[0].screen_durations.article, 45);
  screen.advance(40000);
  assert.equal(screen.elements['article-title'].textContent, 'Story 1');
  screen.advance(6000);
  assert.equal(screen.elements['article-title'].textContent, 'Story 2');
});

test('NASA pictures appear in the next batch with title, description, and credit', async () => {
  const pictures = [1, 2, 3, 4].map((i) => ({ url: `https://images-assets.nasa.gov/p${i}~large.jpg`, kicker: 'NASA Image of the Day',
    title: `Title ${i}`, description: `Description ${i}`, credit: `Photographer ${i}` }));
  const screen = await app('', { pictures });
  screen.run('showPanel(screens.length)');
  const shown = screen.run("screens.filter((item) => item.panel === 'picture').map((item) => item.item.url)");
  assert.equal(shown.length, 3);
  screen.run("showPanel(screens.findIndex((item) => item.panel === 'picture'))");
  assert.equal(screen.elements.picture.classList.contains('active'), true);
  assert.equal(screen.elements['picture-kicker'].textContent, 'NASA Image of the Day');
  assert.match(screen.elements['picture-caption'].textContent, /^Title \d$/);
  assert.match(screen.elements['picture-credit'].textContent, /^Image: Photographer \d$/);
  assert.equal(screen.elements['picture-image'].src, screen.run("screens[current].item.url"));
});

test('direct story URL opens a photo page once feed data is available', async () => {
  const screen = await app('#article');
  assert.equal(screen.elements.article.classList.contains('active'), true);
  assert.equal(screen.elements['article-image'].src, 'https://example.com/0.jpg');
  assert.equal(screen.elements['article-backdrop'].src, screen.elements['article-image'].src);
  assert.equal(screen.elements['article-excerpt'].textContent, 'Description 0');
  assert.equal(screen.elements['article-source'].textContent, 'CNN');
  assert.match(screen.elements['article-status'].textContent, /^Cached/);
  screen.elements['paper-next'].click();
  assert.equal(screen.elements['article-source'].textContent, 'WIRED');
  assert.doesNotMatch(screen.elements['article-status'].textContent, /^Cached/);
});

test('weather renders night-aware central imagery and five forecast icons', async () => {
  const weather = { current: { temperature_2m: 68, apparent_temperature: 68, weather_code: 0,
    is_day: 0, relative_humidity_2m: 85, wind_speed_10m: 9, wind_direction_10m: 225 }, hourly: {
    time: Array.from({ length: 12 }, (_, i) => `2026-10-14T${String(i + 10).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 12 }, (_, i) => 68 + i),
    weather_code: [0, 1, 2, 3, 51, 61, 80, 0, 1, 2, 3, 45],
    precipitation_probability: [0, 1, 2, 4, 12, 35, 50, 20, 10, 5, 3, 2],
    is_day: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0] }, daily: {
    time: ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'],
    temperature_2m_max: [70, 72, 68, 65, 66], temperature_2m_min: [50, 52, 48, 45, 46], weather_code: [0, 2, 3, 61, 95] } };
  const screen = await app('', { weather });
  const [summary, hourly, forecast] = screen.elements['weather-content'].children;
  assert.equal(summary.children[1].dataset.kind, 'moon');
  assert.match(summary.children[1].innerHTML, /clear-night\.svg/);
  assert.match(summary.children[1].attributes['aria-label'], /night/);
  assert.equal(forecast.children.length, 5);
  assert.ok(forecast.children.every((day) => day.children.some((child) => child.className === 'forecast-icon')));
  const slot = summary.children[2].children[2];
  assert.equal(slot.className, 'weather-signal');
  assert.equal(slot.children.length, 1);
  assert.equal(slot.children[0].className, 'signal-item');
  assert.equal(hourly.children[1].children.length, 12);
  assert.equal(hourly.children[1].children[0].children[0].textContent, 'NOW');
  assert.match(hourly.children[1].children[5].attributes['aria-label'], /35% chance of precipitation/);
  assert.equal(slot.children[0].dataset.kind, 'wind');
  assert.match(slot.children[0].attributes['aria-label'], /9 miles per hour from southwest/);
  assert.match(slot.children[0].children[0].children[0].innerHTML, /\/(windsock-calm|windsock-weak|wind-spinner|windmill)\.svg/);
  assert.match(slot.children[0].children[0].children[1].innerHTML, /\/wind-direction-sw\.svg/);
});

test('weather icon style can be fixed in settings', async () => {
  const weather = { current: { temperature_2m: 68, apparent_temperature: 68, weather_code: 0,
    is_day: 1, relative_humidity_2m: 50, wind_speed_10m: 4, wind_direction_10m: 90 }, hourly: {
    time: Array.from({ length: 12 }, (_, i) => `2026-10-14T${String(i + 10).padStart(2, '0')}:00`),
    temperature_2m: Array(12).fill(68), weather_code: Array(12).fill(0),
    precipitation_probability: Array(12).fill(0), is_day: Array(12).fill(1) }, daily: {
    time: ['2026-10-14'], temperature_2m_max: [70], temperature_2m_min: [50], weather_code: [0] } };
  const screen = await app('', { weather });
  screen.elements.settings.click();
  screen.elements['weather-icon-style'].value = 'monochrome';
  screen.elements['weather-icon-color'].value = '#c6f294';
  screen.elements['settings-dialog'].returnValue = 'save';
  await screen.elements['settings-dialog'].listeners.close();
  assert.match(screen.elements['weather-content'].children[0].children[1].innerHTML,
    /\/meteocons\/monochrome\/clear-day\.svg/);
  assert.match(screen.elements['weather-content'].children[0].children[1].innerHTML, /color:#c6f294/);
});

test('weather signal transition removes only the outgoing slide', async () => {
  const weather = { current: { temperature_2m: 68, apparent_temperature: 68, weather_code: 0,
    is_day: 0, relative_humidity_2m: 85, wind_speed_10m: 9, wind_direction_10m: 225 }, hourly: {
    time: Array.from({ length: 12 }, (_, i) => `2026-10-14T${String(i + 10).padStart(2, '0')}:00`),
    temperature_2m: Array(12).fill(68), weather_code: Array(12).fill(0),
    precipitation_probability: Array(12).fill(0), is_day: Array(12).fill(0) }, daily: {
    time: ['2026-10-14', '2026-10-15'], sunrise: ['2026-10-14T07:10', '2026-10-15T07:11'],
    sunset: ['2026-10-14T18:22', '2026-10-15T18:21'], temperature_2m_max: [70, 72],
    temperature_2m_min: [50, 52], weather_code: [0, 2] }, utc_offset_seconds: -14400 };
  const screen = await app('', { weather });
  const slot = screen.elements['weather-content'].children[0].children[2].children[2];
  const outgoing = slot.children[0];
  screen.run('signalSlot.shownAt = Date.now() - WeatherSignals.ROTATE_MS; updateWeatherSignal()');
  assert.equal(slot.children.length, 2);
  const incoming = slot.children[1];
  assert.equal(incoming.classList.contains('entering'), true);
  screen.finishTransitions();
  assert.deepEqual(slot.children, [incoming]);
  assert.equal(incoming.classList.contains('entering'), false);
  assert.equal(outgoing.parentElement, null);
});

test('display markup has no app header, story count, article link, or quote collection link', () => {
  const markup = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(markup, />The Daily</);
  for (const removed of ['screen-dots', 'screen-dot', 'quote-mark', 'class="masthead"', 'id="article-page"', 'id="article-link"', 'FROM THE QUOTE COLLECTION', 'darrelld.com', '02 / OUTSIDE', 'WEATHER DATA / OPEN-METEO']) {
    assert.equal(markup.includes(removed), false, removed);
  }
  assert.match(markup, /class="quote-lockup"/);
  const weather = markup.match(/<section[^>]+id="weather"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(weather, /Open-Meteo/);
});

test('story controls reach weather and return to stories without a headline list', async () => {
  const screen = await app();
  screen.elements['paper-next'].click();
  assert.equal(screen.elements['article-title'].textContent, 'Story 1');
  screen.elements['paper-next'].click();
  assert.equal(screen.elements['article-title'].textContent, 'Story 2');
  screen.elements['paper-next'].click();
  assert.equal(screen.elements.weather.classList.contains('active'), true);
  assert.equal(screen.extras['.footer'].inert, false);
  screen.listeners.keydown({ key: 'ArrowLeft', target: { tagName: 'BODY' }, preventDefault() {} });
  assert.equal(screen.elements.article.classList.contains('active'), true);
  assert.equal(screen.elements['article-title'].textContent, 'Story 2');
});

test('radar screen is centered on the configured ZIP and has live map layers', async () => {
  const screen = await app();
  screen.run("showPanel(screens.findIndex((screen) => screen.panel === 'radar'))");
  assert.equal(screen.elements.radar.classList.contains('active'), true);
  assert.ok(screen.elements['radar-map'].children.length >= 2);
  assert.equal(screen.elements['radar-temperatures'].children[0].children[0].textContent, 'Harrisburg');
  assert.equal(screen.elements['radar-temperatures'].children[0].children[1].textContent, '69°');
  assert.equal(screen.elements['radar-map'].children.filter((child) => child.className.includes('radar-forecast')).length, 6);
  screen.run('showRadarFrame(4)');
  assert.equal(screen.elements.radar.dataset.mode, 'forecast');
  assert.match(screen.elements['radar-mode'].textContent, /^FORECAST/);
});

test('radar display omits the title block and visible provider credit line', () => {
  const markup = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const radar = markup.match(/<section[^>]+id="radar"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(radar, /Philadelphia radar|REGIONAL WEATHER|radar-heading|radar-attribution|OpenStreetMap contributors|RainViewer/);
});

test('progress advances on animation frames between seconds, freezes on pause, and resumes', async () => {
  const screen = await app();
  screen.frame(16);
  const first = screen.elements['article-progress'].style.transform;
  screen.frame(16);
  const second = screen.elements['article-progress'].style.transform;
  assert.notEqual(first, second);
  assert.equal(second, screen.elements.progress.style.transform);
  screen.elements['paper-pause'].click();
  screen.frame(1000);
  assert.equal(screen.elements['article-progress'].style.transform, second);
  screen.elements['paper-pause'].click();
  screen.frame(16);
  assert.notEqual(screen.elements['article-progress'].style.transform, second);
});

test('keyboard arrows work after focusing story buttons and an image failure keeps the story visible', async () => {
  const screen = await app('#article');
  screen.listeners.keydown({ key: 'ArrowRight', target: { tagName: 'BUTTON' }, preventDefault() {} });
  assert.equal(screen.elements['article-title'].textContent, 'Story 1');
  screen.elements['article-image'].onerror();
  assert.equal(screen.elements.article.classList.contains('paper-no-image'), true);
  assert.equal(screen.elements.article.classList.contains('active'), true);
});
