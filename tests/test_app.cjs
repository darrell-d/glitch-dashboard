const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createEdition } = require('../public/edition.js');

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

async function app(hash = '') {
  const markup = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const elements = Object.fromEntries([...markup.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  const extras = { '.masthead': new Element(), '.footer': new Element(), '.paper-story': new Element() };
  const navigation = ['article', 'weather', 'quote'].map((panel) => {
    const button = new Element('BUTTON');
    button.dataset.panel = panel;
    return button;
  });
  const listeners = {};
  const location = { hash };
  let now = 0;
  const frames = [];
  const items = Array.from({ length: 3 }, (_, i) => ({ title: `Story ${i}`, description: `Description ${i}`,
    url: `https://example.com/${i}`, image_url: `https://example.com/${i}.jpg` }));
  const document = {
    body: new Element('BODY'), fullscreenEnabled: false,
    getElementById: (id) => { assert.ok(elements[id], `Unknown element ${id}`); return elements[id]; },
    createElement: (tag) => new Element(tag.toUpperCase()),
    querySelectorAll: () => navigation,
    querySelector: (selector) => extras[selector] || navigation.find((button) => selector === `[data-panel=${button.dataset.panel}]`),
    addEventListener: (event, callback) => { listeners[event] = callback; },
  };
  const context = vm.createContext({ document, location, DashboardEdition: { createEdition },
    window: { addEventListener() {} }, history: { replaceState: (_, __, hash) => { location.hash = hash; } },
    localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => now },
    getComputedStyle: () => ({ fontSize: '32px' }), requestAnimationFrame: (callback) => frames.push(callback),
    setInterval() {}, setTimeout() {}, clearTimeout() {}, AbortController,
    fetch: async (url) => ({ ok: true, json: async () => {
      if (url === '/api/config') return { location: 'Philadelphia', timezone: 'America/New_York' };
      if (url === '/api/news') return { data: { items }, updated_at: new Date().toISOString(), stale: false };
      throw new Error('Other feed offline');
    } }),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'), context);
  await new Promise(setImmediate);
  return { elements, extras, location, listeners, navigation,
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
  assert.equal(screen.elements['article-excerpt'].textContent, 'Description 0');
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
  screen.navigation.find((button) => button.dataset.panel === 'article').click();
  assert.equal(screen.elements['article-title'].textContent, 'Story 0');
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
