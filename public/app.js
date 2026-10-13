'use strict';

const $ = (id) => document.getElementById(id);
const names = ['news', 'weather', 'quote'];
const records = {};
let config = { location: 'Philadelphia', timezone: 'America/New_York' };
let options = { duration: 30, transition: 'fade' };
let current = 0;
let newsOffset = 0;
let paused = false;
let started = performance.now();
let elapsed = 0;

function readStored(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be disabled. */ }
}
function validOptions(value) {
  return value && Number.isFinite(value.duration) && value.duration >= 5 && value.duration <= 600
    && ['fade', 'slide', 'none'].includes(value.transition);
}
const savedOptions = readStored('glitch-display-options');
if (validOptions(savedOptions)) options = savedOptions;
document.body.dataset.transition = options.transition;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function number(value) { return Number.isFinite(value) ? Math.round(value) : '–'; }
function celsius(value) { return number((value - 32) * 5 / 9); }
function condition(code) {
  if (code === 0) return 'Clear skies';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return 'Conditions unavailable';
}

function renderNews(data) {
  const list = $('headlines');
  list.replaceChildren();
  for (let i = 0; i < Math.min(3, data.items.length); i++) {
    const index = (newsOffset + i) % data.items.length;
    const item = data.items[index];
    const row = node('article', 'headline');
    row.append(node('span', 'headline-number', String(index + 1).padStart(2, '0')));
    const link = node('a', '', item.title);
    if (item.url.startsWith('https://')) link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    row.append(link);
    list.append(row);
  }
}

function renderWeather(data) {
  const { current: now, daily } = data;
  $('weather-heading').textContent = config.location;
  const content = $('weather-content');
  const summary = node('div', 'weather-now');
  const temperatures = node('div');
  const temperature = node('div', 'temperature', number(now.temperature_2m));
  temperature.append(node('small', '', '°F'));
  temperatures.append(temperature, node('div', 'celsius', `${celsius(now.temperature_2m)}°C`));
  const conditions = node('div', 'conditions');
  conditions.append(node('p', 'condition-label', condition(now.weather_code)));
  const details = node('div', 'weather-detail');
  details.append(node('div', '', `Feels like ${number(now.apparent_temperature)}°F / ${celsius(now.apparent_temperature)}°C`));
  details.append(node('div', '', `Humidity ${number(now.relative_humidity_2m)}% · Wind ${number(now.wind_speed_10m)} mph`));
  conditions.append(details);
  summary.append(temperatures, conditions);
  const forecast = node('div', 'forecast');
  daily.time.forEach((day, i) => {
    const column = node('div', 'forecast-day');
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
    column.append(node('div', 'forecast-name', i === 0 ? 'TODAY' : dayName.toUpperCase()));
    const high = node('div', 'forecast-temp', `${number(daily.temperature_2m_max[i])}°`);
    high.append(node('span', '', ` / ${number(daily.temperature_2m_min[i])}°F`));
    column.append(high,
      node('div', 'forecast-condition', `${celsius(daily.temperature_2m_max[i])}° / ${celsius(daily.temperature_2m_min[i])}°C`),
      node('div', 'forecast-condition', condition(daily.weather_code[i])));
    forecast.append(column);
  });
  content.replaceChildren(summary, forecast);
}

function fitQuote() {
  const text = $('quote-text');
  text.style.fontSize = '';
  const container = text.parentElement;
  let size = parseFloat(getComputedStyle(text).fontSize);
  while (container.scrollHeight > container.clientHeight + 1 && size > 18) {
    size -= 2;
    text.style.fontSize = `${size}px`;
  }
}
function renderQuote(data) {
  $('quote-text').textContent = data.text;
  $('quote-author').textContent = data.author;
  requestAnimationFrame(fitQuote);
}
const renderers = { news: renderNews, weather: renderWeather, quote: renderQuote };

async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Feed unavailable');
    return await response.json();
  } finally { clearTimeout(timer); }
}

const inflight = new Set();
async function refresh(name) {
  if (inflight.has(name)) return;
  inflight.add(name);
  try {
    const value = await request(`/api/${name}`);
    if (!value.data || !value.updated_at) throw new Error('Missing feed data');
    if (name === 'weather') value.configKey = JSON.stringify(config);
    renderers[name](value.data);
    records[name] = value;
    store(`glitch-feed-${name}`, value);
  } catch {
    if (records[name]) records[name].stale = true;
    else {
      const messages = { news: 'Headlines are temporarily unavailable.', weather: 'Weather is temporarily unavailable.', quote: 'The quote collection is temporarily unavailable.' };
      if (name === 'quote') $('quote-text').textContent = messages[name];
      else $(name === 'news' ? 'headlines' : 'weather-content').replaceChildren(node('p', 'placeholder', messages[name]));
    }
  } finally {
    inflight.delete(name);
    updateStatuses();
  }
}

function updateStatuses() {
  for (const name of names) {
    const record = records[name];
    if (!record) {
      $(`${name}-status`).textContent = inflight.has(name) ? 'Connecting' : 'Unavailable · retrying';
      continue;
    }
    const age = Math.max(0, Math.floor((Date.now() - Date.parse(record.updated_at)) / 60000));
    const stale = record.stale || age >= (name === 'quote' ? 3 : 15);
    $(`${name}-status`).textContent = `${stale ? 'Cached · ' : ''}Updated ${age < 1 ? 'just now' : `${age}m ago`}`;
  }
}

function resetTimer() { elapsed = 0; started = performance.now(); }
function showPanel(index) {
  current = (index + names.length) % names.length;
  names.forEach((name, i) => {
    const active = i === current;
    $(name).classList.toggle('active', active);
    $(name).inert = !active;
    $(name).setAttribute('aria-hidden', String(!active));
  });
  document.querySelectorAll('[data-panel]').forEach((button, i) => button.setAttribute('aria-current', String(i === current)));
  if (current === 0 && records.news) {
    newsOffset = (newsOffset + 3) % records.news.data.items.length;
    renderNews(records.news.data);
  }
  if (current === 2) { refresh('quote'); requestAnimationFrame(fitQuote); }
  resetTimer();
}
function setPaused(value) {
  if (value === paused) return;
  if (value) elapsed += performance.now() - started;
  else started = performance.now();
  paused = value;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-label', paused ? 'Resume rotation' : 'Pause rotation');
}
function tick() {
  const total = options.duration * 1000;
  let used = elapsed + (paused ? 0 : performance.now() - started);
  if (used >= total && !paused) { showPanel(current + 1); used = 0; }
  $('countdown').textContent = paused ? 'Ⅱ' : `${Math.max(0, Math.ceil((total - used) / 1000))}s`;
  $('progress').style.transform = `scaleX(${Math.min(1, used / total)})`;
}
function updateClock() {
  const now = new Date();
  try {
    $('date').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: config.timezone }).format(now);
    $('clock').textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: config.timezone }).format(now);
    $('clock').dateTime = now.toISOString();
  } catch { $('clock').textContent = now.toLocaleTimeString(); }
}

document.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => showPanel(Number(button.dataset.panel))));
$('pause').addEventListener('click', () => setPaused(!paused));
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { $('fullscreen').textContent = 'Use browser fullscreen'; }
}
if (!document.fullscreenEnabled) $('fullscreen').hidden = true;
$('fullscreen').addEventListener('click', toggleFullscreen);
let wasPaused = false;
$('settings').addEventListener('click', () => {
  wasPaused = paused;
  setPaused(true);
  $('duration').value = options.duration;
  $('transition').value = options.transition;
  $('settings-dialog').returnValue = '';
  $('settings-dialog').showModal();
});
$('settings-dialog').addEventListener('close', () => {
  if ($('settings-dialog').returnValue === 'save') {
    const value = { duration: Number($('duration').value), transition: $('transition').value };
    if (validOptions(value)) {
      options = value;
      store('glitch-display-options', options);
      document.body.dataset.transition = options.transition;
      resetTimer();
    }
  }
  setPaused(wasPaused);
});
document.addEventListener('keydown', (event) => {
  if ($('settings-dialog').open || /INPUT|SELECT|TEXTAREA|BUTTON|A/.test(event.target.tagName)) return;
  if (event.key === 'ArrowRight') showPanel(current + 1);
  else if (event.key === 'ArrowLeft') showPanel(current - 1);
  else if (event.code === 'Space') { event.preventDefault(); setPaused(!paused); }
  else if (event.key.toLowerCase() === 'f') toggleFullscreen();
  else if (event.key.toLowerCase() === 's') $('settings').click();
});
window.addEventListener('resize', fitQuote);
if (document.fonts) document.fonts.ready.then(fitQuote);

async function init() {
  try { config = await request('/api/config'); } catch { /* Keep known initial defaults. */ }
  updateClock();
  for (const name of names) {
    const cached = readStored(`glitch-feed-${name}`);
    // Weather cache belongs to a specific location/configuration.
    const configKey = JSON.stringify(config);
    if (cached && cached.data && cached.updated_at && (name !== 'weather' || cached.configKey === configKey)) {
      try { renderers[name](cached.data); records[name] = { ...cached, stale: true }; } catch { /* Ignore invalid caches. */ }
    }
    refresh(name);
  }
  resetTimer();
  setInterval(() => { refresh('news'); refresh('weather'); }, 60000);
  setInterval(() => refresh('quote'), 90000);
  setInterval(updateStatuses, 10000);
}
setInterval(tick, 250);
setInterval(updateClock, 1000);
init();
