const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createEdition } = require('../public/edition.js');
const WeatherVisual = require('../public/weather.js');
const MoonPhase = require('../public/moon.js');

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
    this.classes = new Set();
    this.classList = { toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name),
      add: (name) => this.classes.add(name), contains: (name) => this.classes.has(name) };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  click() { this.listeners.click?.(); }
}

async function app(hash = '', { storyCount = 3, weather = null } = {}) {
  const markup = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const elements = Object.fromEntries([...markup.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  const extras = { '.footer': new Element(), '.paper-story': new Element() };
  const listeners = {};
  const location = { hash };
  let now = 0;
  const frames = [];
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
  const context = vm.createContext({ document, location, DashboardEdition: { createEdition }, WeatherVisual, MoonPhase,
    window: { addEventListener() {} }, history: { replaceState: (_, __, hash) => { location.hash = hash; } },
    localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => now },
    getComputedStyle: () => ({ fontSize: '32px' }), requestAnimationFrame: (callback) => frames.push(callback),
    setInterval() {}, setTimeout() {}, clearTimeout() {}, AbortController,
    fetch: async (url) => ({ ok: true, json: async () => {
      if (url === '/api/config') return { location: 'Philadelphia', timezone: 'America/New_York' };
      if (url === '/api/news') return { data: { items }, updated_at: new Date().toISOString(), stale: false };
      if (url === '/api/weather' && weather) return { data: weather, updated_at: new Date().toISOString(), stale: false };
      throw new Error('Other feed offline');
    } }),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'), context);
  await new Promise(setImmediate);
  return { elements, extras, location, listeners,
    run: (code) => vm.runInContext(code, context), advance: (milliseconds) => { now += milliseconds; vm.runInContext('tick()', context); },
    frame: (milliseconds) => { now += milliseconds; const pending = frames.splice(0); pending.forEach((callback) => callback()); } };
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
    is_day: 0, relative_humidity_2m: 85, wind_speed_10m: 9 }, daily: {
    time: ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'],
    temperature_2m_max: [70, 72, 68, 65, 66], temperature_2m_min: [50, 52, 48, 45, 46], weather_code: [0, 2, 3, 61, 95] } };
  const screen = await app('', { weather });
  const [summary, forecast] = screen.elements['weather-content'].children;
  assert.equal(summary.children[1].dataset.kind, 'moon');
  assert.match(summary.children[1].innerHTML, /#moon/);
  assert.match(summary.children[1].attributes['aria-label'], /night/);
  assert.equal(forecast.children.length, 5);
  assert.ok(forecast.children.every((day) => day.children.some((child) => child.className === 'forecast-icon')));
  const moon = summary.children[2].children[2];
  assert.equal(moon.className, 'moon-phase');
  assert.match(moon.attributes['aria-label'], /^Moon: /);
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
