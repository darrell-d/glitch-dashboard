'use strict';

const $ = (id) => document.getElementById(id);
const names = ['news', 'weather', 'radar', 'quote'];
const panels = ['news', 'article', 'weather', 'radar', 'quote'];
let screens = DashboardEdition.createEdition([]);
const records = {};
let config = { location: 'Local weather', region: '', postal_code: '19103', timezone: 'America/New_York' };
let options = { duration: 30, transition: 'fade', postalCode: '19103', weatherIconStyle: 'weekly', weatherIconColor: '#dce7d6' };
let current = 0;
let newsOffset = 0;
let paused = false;
let started = performance.now();
let elapsed = 0;
let pendingArticle = location.hash === '#article';
let rotationItems = [];

function readStored(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be disabled. */ }
}
function validOptions(value) {
  return value && Number.isFinite(value.duration) && value.duration >= 5 && value.duration <= 600
    && ['fade', 'slide', 'none'].includes(value.transition)
    && (value.postalCode === undefined || /^\d{5}(?:-\d{4})?$/.test(value.postalCode))
    && (value.weatherIconStyle === undefined || ['weekly', ...WeatherVisual.STYLES].includes(value.weatherIconStyle))
    && (value.weatherIconColor === undefined || /^#[0-9a-f]{6}$/i.test(value.weatherIconColor));
}
const savedOptions = readStored('glitch-display-options');
if (validOptions(savedOptions)) options = { ...options, ...savedOptions };
document.body.dataset.transition = options.transition;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function number(value) { return Number.isFinite(value) ? Math.round(value) : '–'; }
function celsius(value) { return number((value - 32) * 5 / 9); }
function displayHour(stamp, index) {
  if (index === 0) return 'NOW';
  const hour = Number(stamp.slice(11, 13));
  return Number.isInteger(hour) ? `${hour % 12 || 12}${hour < 12 ? 'A' : 'P'}` : '—';
}
const condition = WeatherVisual.description;
const locationQuery = () => `postal_code=${encodeURIComponent(options.postalCode)}`;

function renderNews(data) {
  $('source-status-list').replaceChildren(...(data.sources || []).map((source) => {
    const state = !source.available ? 'unavailable' : `${source.count} stories${source.stale ? ' · cached' : ''}`;
    return node('li', '', `${source.name}${source.selection ? ` · ${source.selection}` : ''}: ${state}`);
  }));
  // Start directly with stories once available, then finish each fixed batch.
  if (screens.some((screen) => screen.panel === 'article')) return;
  rotationItems = data.items.map((item) => ({ ...item }));
  screens = DashboardEdition.createEdition(rotationItems, newsOffset);
  current = 0;
  showPanel(0);
}

function renderArticle(screen) {
  const item = screen.item;
  const source = item.source || 'The New York Times';
  $('article-source').textContent = `${source}${item.selection ? ` · ${item.selection}` : ''}`;
  $('article-title').textContent = item.title;
  $('article-author').textContent = item.author ? `By ${item.author}` : source;
  $('article-excerpt').textContent = item.description || 'A description is unavailable for this story.';
  const published = new Date(item.published || NaN);
  $('article-date').textContent = Number.isFinite(published.getTime())
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: config.timezone }).format(published) : '';
  $('article-date').dateTime = Number.isFinite(published.getTime()) ? published.toISOString() : '';
  const image = $('article-image');
  const backdrop = $('article-backdrop');
  const hasImage = typeof item.image_url === 'string' && item.image_url.startsWith('https://');
  $('article').classList.toggle('paper-no-image', !hasImage);
  image.onerror = () => {
    $('article').classList.add('paper-no-image');
    requestAnimationFrame(fitArticle);
  };
  image.alt = item.image_caption || item.title;
  image.removeAttribute('src');
  backdrop.removeAttribute('src');
  if (hasImage) {
    backdrop.src = item.image_url;
    image.src = item.image_url;
  }
  $('article-caption').textContent = item.image_caption || '';
  $('article-credit').textContent = item.image_credit || '';
  updateStatuses();
  requestAnimationFrame(fitArticle);
}

function fitArticle() {
  if (screens[current].panel !== 'article') return;
  const title = $('article-title');
  const excerpt = $('article-excerpt');
  title.style.fontSize = '';
  excerpt.style.fontSize = '';
  const column = document.querySelector('.paper-story');
  // Fit real, often long headlines into the paper column without cropping photos.
  let titleSize = parseFloat(getComputedStyle(title).fontSize);
  while (column.scrollHeight > column.clientHeight + 1 && titleSize > 26) {
    titleSize -= 1;
    title.style.fontSize = `${titleSize}px`;
  }
  let size = parseFloat(getComputedStyle(excerpt).fontSize);
  while (column.scrollHeight > column.clientHeight + 1 && size > 14) {
    size -= 1;
    excerpt.style.fontSize = `${size}px`;
  }
}

function renderWeather(data) {
  const { current: now, hourly, daily } = data;
  const iconStyle = WeatherVisual.resolveStyle(options.weatherIconStyle);
  $('weather-heading').textContent = config.location;
  const content = $('weather-content');
  const summary = node('div', 'weather-now');
  const temperatures = node('div');
  const temperature = node('div', 'temperature', number(now.temperature_2m));
  temperature.append(node('small', '', '°F'));
  temperatures.append(temperature, node('div', 'celsius', `${celsius(now.temperature_2m)}°C`));
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: config.timezone }).format(new Date()));
  const isDay = now.is_day === 0 ? false : now.is_day === 1 ? true : hour >= 7 && hour < 19;
  const illustration = node('div', 'weather-art');
  illustration.dataset.kind = WeatherVisual.appearance(now.weather_code, isDay);
  illustration.setAttribute('role', 'img');
  illustration.setAttribute('aria-label', `${condition(now.weather_code)}${isDay ? '' : ' at night'}`);
  illustration.innerHTML = WeatherVisual.icon(now.weather_code, isDay, iconStyle, options.weatherIconColor);
  const conditions = node('div', 'conditions');
  conditions.append(node('p', 'condition-label', condition(now.weather_code)));
  const details = node('div', 'weather-detail');
  details.append(node('div', '', `Feels like ${number(now.apparent_temperature)}°F / ${celsius(now.apparent_temperature)}°C`));
  details.append(node('div', '', `Humidity ${number(now.relative_humidity_2m)}% · Wind ${number(now.wind_speed_10m)} mph`));
  const moon = MoonPhase.info(new Date());
  const lunar = node('div', 'moon-phase');
  lunar.setAttribute('aria-label', `Moon: ${moon.name}, ${moon.illumination}% illuminated`);
  const disc = node('span', 'moon-disc');
  disc.dataset.phase = moon.key;
  disc.setAttribute('aria-hidden', 'true');
  const lunarText = node('div');
  lunarText.append(node('div', 'moon-name', moon.name), node('div', 'moon-illumination', `${moon.illumination}% illuminated`));
  lunar.append(disc, lunarText);
  conditions.append(details, lunar);
  summary.append(temperatures, illustration, conditions);
  const hourlySection = node('section', 'hourly-section');
  hourlySection.setAttribute('aria-label', 'Next 12 hours');
  hourlySection.append(node('div', 'hourly-label', 'NEXT 12 HOURS'));
  const hourlyForecast = node('div', 'hourly-forecast');
  hourly.time.slice(0, 12).forEach((stamp, i) => {
    const code = hourly.weather_code[i];
    const rain = number(hourly.precipitation_probability[i]);
    const hour = node('div', 'hourly-hour');
    hour.setAttribute('aria-label', `${displayHour(stamp, i)}: ${condition(code)}, ${number(hourly.temperature_2m[i])}°F, ${rain}% chance of precipitation`);
    const icon = node('div', 'hourly-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = WeatherVisual.icon(code, hourly.is_day[i] !== 0, iconStyle, options.weatherIconColor);
    const rainChance = node('div', 'hourly-rain', `${rain}%`);
    if (rain >= 30) rainChance.dataset.wet = 'true';
    hour.append(node('div', 'hourly-time', displayHour(stamp, i)), icon,
      node('div', 'hourly-temp', `${number(hourly.temperature_2m[i])}°`), rainChance);
    hourlyForecast.append(hour);
  });
  hourlySection.append(hourlyForecast);
  const forecast = node('div', 'forecast');
  daily.time.forEach((day, i) => {
    const column = node('div', 'forecast-day');
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
    column.append(node('div', 'forecast-name', i === 0 ? 'TODAY' : dayName.toUpperCase()));
    const icon = node('div', 'forecast-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = WeatherVisual.icon(daily.weather_code[i], true, iconStyle, options.weatherIconColor);
    column.append(icon);
    const high = node('div', 'forecast-temp', `${number(daily.temperature_2m_max[i])}°`);
    high.append(node('span', '', ` / ${number(daily.temperature_2m_min[i])}°F`));
    column.append(high,
      node('div', 'forecast-celsius', `${celsius(daily.temperature_2m_max[i])}° / ${celsius(daily.temperature_2m_min[i])}°C`),
      node('div', 'forecast-condition', condition(daily.weather_code[i])));
    forecast.append(column);
  });
  content.replaceChildren(summary, hourlySection, forecast);
  WeatherVisual.hydrate(content);
}

let radarFrames = [];
let radarFrameIndex = 0;
function radarTile(layer, tile, size, source) {
  const image = node('img');
  image.alt = '';
  image.draggable = false;
  image.loading = 'eager';
  image.width = size;
  image.height = size;
  image.style.left = `${tile.left}px`;
  image.style.top = `${tile.top}px`;
  image.style.width = `${size}px`;
  image.style.height = `${size}px`;
  image.src = source(tile);
  layer.append(image);
}

function showRadarFrame(index) {
  if (!radarFrames.length) return;
  radarFrameIndex = ((index % radarFrames.length) + radarFrames.length) % radarFrames.length;
  radarFrames.forEach((frame, i) => frame.layer.classList.toggle('active', i === radarFrameIndex));
  const stamp = new Date(radarFrames[radarFrameIndex].time * 1000);
  $('radar-frame-time').textContent = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: config.timezone,
  }).format(stamp);
  $('radar-frame-time').dateTime = stamp.toISOString();
}

function renderRadar(data) {
  const map = $('radar-map');
  const width = map.clientWidth || window.innerWidth || 1920;
  const height = map.clientHeight || window.innerHeight || 1080;
  const latitude = data.location.latitude;
  const longitude = data.location.longitude;
  const base = node('div', 'radar-layer radar-base');
  RadarMap.tileLayout(latitude, longitude, width, height, 8, 256).forEach((tile) =>
    radarTile(base, tile, 256, ({ x, y }) => `https://tile.openstreetmap.org/8/${x}/${y}.png`));
  radarFrames = data.frames.map((frame) => {
    const layer = node('div', 'radar-layer radar-precipitation');
    RadarMap.tileLayout(latitude, longitude, width, height, 7, 512).forEach((tile) =>
      radarTile(layer, tile, 512, ({ x, y }) => `${data.host}${frame.path}/512/7/${x}/${y}/2/1_1.png`));
    return { layer, time: frame.time };
  });
  map.replaceChildren(base, ...radarFrames.map((frame) => frame.layer));
  const labels = [];
  const currentTemperature = records.weather?.data?.current?.temperature_2m;
  if (Number.isFinite(currentTemperature)) {
    labels.push({ name: config.location, temperature: currentTemperature, latitude, longitude, home: true });
  }
  labels.push(...data.stations.map((station) => ({ ...station, home: false })));
  const occupied = [];
  $('radar-temperatures').replaceChildren(...labels.flatMap((station) => {
    const point = RadarMap.viewportPoint(station.latitude, station.longitude,
      latitude, longitude, width, height, 8, 256);
    if (point.x < 70 || point.x > width - 70 || point.y < 190 || point.y > height - 100) return [];
    if (!station.home && occupied.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 130)) return [];
    occupied.push(point);
    const label = node('div', `radar-temperature${station.home ? ' home' : ''}`);
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
    label.append(node('strong', '', `${number(station.temperature)}°`), node('span', '', station.name));
    return [label];
  }));
  showRadarFrame(radarFrameIndex);
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
const renderers = { news: renderNews, weather: renderWeather, radar: renderRadar, quote: renderQuote };

async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path.startsWith('/api/news') || path.startsWith('/api/radar') ? 25000 : 15000);
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
    const endpoint = name === 'weather' || name === 'radar' ? `/api/${name}?${locationQuery()}` : `/api/${name}`;
    const value = await request(endpoint);
    if (!value.data || !value.updated_at) throw new Error('Missing feed data');
    if (name === 'weather' || name === 'radar') value.configKey = options.postalCode;
    renderers[name](value.data);
    records[name] = value;
    store(name === 'news' ? 'glitch-feed-news-v2' : `glitch-feed-${name}`, value);
    if (name === 'news') openPendingArticle();
  } catch {
    if (records[name]) records[name].stale = true;
    else {
      const messages = { news: 'Headlines are temporarily unavailable.', weather: 'Weather is temporarily unavailable.', radar: 'Regional radar is temporarily unavailable.', quote: 'The quote collection is temporarily unavailable.' };
      if (name === 'quote') $('quote-text').textContent = messages[name];
      else if (name === 'radar') $('radar-status').textContent = messages[name];
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
    const stale = record.stale || age >= (name === 'quote' ? 3 : name === 'radar' ? 8 : 15);
    $(`${name}-status`).textContent = `${stale ? 'Cached · ' : ''}Updated ${age < 1 ? 'just now' : `${age}m ago`}`;
  }
  $('article-status').textContent = $('news-status').textContent;
  const item = screens[current].item;
  if (item && item.source_updated_at) {
    const age = Math.max(0, Math.floor((Date.now() - Date.parse(item.source_updated_at)) / 60000));
    const health = records.news?.data.sources?.find((source) => source.id === item.source_id);
    const stale = item.source_stale || health?.stale || records.news?.stale || age >= 15;
    $('article-status').textContent = `${stale ? 'Cached · ' : ''}Updated ${age < 1 ? 'just now' : `${age}m ago`}`;
  }
}

function resetTimer() { elapsed = 0; started = performance.now(); }
function openPendingArticle() {
  if (!pendingArticle) return;
  const index = screens.findIndex((screen) => screen.panel === 'article');
  if (index !== -1) {
    pendingArticle = false;
    showPanel(index);
  }
}
function showPanel(index) {
  if (index >= screens.length) {
    if (records.news) {
      newsOffset = (newsOffset + Math.min(3, records.news.data.items.length)) % records.news.data.items.length;
      rotationItems = records.news.data.items.map((item) => ({ ...item }));
      screens = DashboardEdition.createEdition(rotationItems, newsOffset);
      current = 0;
    }
    index = 0;
  }
  current = (index + screens.length) % screens.length;
  const screen = screens[current];
  document.body.dataset.view = screen.panel;
  document.querySelector('.footer').inert = screen.panel === 'article';
  panels.forEach((name) => {
    const active = name === screen.panel;
    $(name).classList.toggle('active', active);
    $(name).inert = !active;
    $(name).setAttribute('aria-hidden', String(!active));
  });
  if (screen.panel === 'article') renderArticle(screen);
  if (screen.panel === 'radar') showRadarFrame(radarFrameIndex);
  if (screen.panel === 'quote') { refresh('quote'); requestAnimationFrame(fitQuote); }
  history.replaceState(null, '', `#${screen.panel}`);
  resetTimer();
}
function setPaused(value) {
  if (value === paused) return;
  if (value) elapsed += performance.now() - started;
  else started = performance.now();
  paused = value;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('paper-pause').textContent = paused ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-label', paused ? 'Resume rotation' : 'Pause rotation');
}
function tick() {
  const total = options.duration * 1000;
  let used = elapsed + (paused ? 0 : performance.now() - started);
  if (used >= total && !paused) { showPanel(current + 1); used = 0; }
  const countdown = paused ? 'Ⅱ' : `${Math.max(0, Math.ceil((total - used) / 1000))}s`;
  if ($('countdown').textContent !== countdown) $('countdown').textContent = countdown;
  $('progress').style.transform = `scaleX(${Math.min(1, used / total)})`;
  $('article-progress').style.transform = $('progress').style.transform;
}
function updateClock() {
  const now = new Date();
  try {
    $('date').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: config.timezone }).format(now);
    $('clock').textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: config.timezone }).format(now);
    $('clock').dateTime = now.toISOString();
  } catch { $('clock').textContent = now.toLocaleTimeString(); }
}

$('pause').addEventListener('click', () => setPaused(!paused));
$('paper-pause').addEventListener('click', () => setPaused(!paused));
$('paper-previous').addEventListener('click', () => showPanel(current - 1));
$('paper-next').addEventListener('click', () => showPanel(current + 1));
$('paper-settings').addEventListener('click', () => $('settings').click());
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { $('fullscreen').textContent = 'Use browser fullscreen'; }
}
if (!document.fullscreenEnabled) {
  $('fullscreen').hidden = true;
  $('paper-fullscreen').hidden = true;
}
$('fullscreen').addEventListener('click', toggleFullscreen);
$('paper-fullscreen').addEventListener('click', toggleFullscreen);
let wasPaused = false;
$('settings').addEventListener('click', () => {
  wasPaused = paused;
  setPaused(true);
  $('duration').value = options.duration;
  $('transition').value = options.transition;
  $('postal-code').value = options.postalCode;
  $('weather-icon-style').value = options.weatherIconStyle;
  $('weather-icon-color').value = options.weatherIconColor;
  $('settings-dialog').returnValue = '';
  $('settings-dialog').showModal();
});
$('settings-dialog').addEventListener('close', async () => {
  if ($('settings-dialog').returnValue === 'save') {
    const value = { duration: Number($('duration').value), transition: $('transition').value,
      postalCode: $('postal-code').value.slice(0, 5), weatherIconStyle: $('weather-icon-style').value,
      weatherIconColor: $('weather-icon-color').value };
    if (validOptions(value)) {
      if (value.postalCode !== options.postalCode) {
        try {
          config = await request(`/api/config?postal_code=${encodeURIComponent(value.postalCode)}`);
          delete records.weather;
          delete records.radar;
          $('weather-heading').textContent = config.location;
          $('weather-content').replaceChildren(node('p', 'placeholder', 'Updating local weather…'));
          $('radar-map').replaceChildren();
          $('radar-temperatures').replaceChildren();
        } catch {
          $('weather-status').textContent = 'ZIP code unavailable · using previous location';
          $('radar-status').textContent = 'ZIP code unavailable · using previous location';
          setPaused(wasPaused);
          return;
        }
      }
      options = value;
      store('glitch-display-options', options);
      document.body.dataset.transition = options.transition;
      if (records.weather?.data) renderWeather(records.weather.data);
      updateClock();
      refresh('weather');
      refresh('radar');
      resetTimer();
    }
  }
  setPaused(wasPaused);
});
document.addEventListener('keydown', (event) => {
  if ($('settings-dialog').open || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); showPanel(current + 1); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); showPanel(current - 1); }
  else if (event.code === 'Space' && !/BUTTON|A/.test(event.target.tagName)) { event.preventDefault(); setPaused(!paused); }
  else if (event.key.toLowerCase() === 'f') toggleFullscreen();
  else if (event.key.toLowerCase() === 's') $('settings').click();
});
window.addEventListener('resize', () => { fitQuote(); fitArticle(); if (records.radar?.data) renderRadar(records.radar.data); });
window.addEventListener('hashchange', () => {
  if (location.hash === '#article') {
    pendingArticle = true;
    openPendingArticle();
  } else {
    const index = screens.findIndex((screen) => `#${screen.panel}` === location.hash);
    if (index !== -1) showPanel(index);
  }
});
if (document.fonts) document.fonts.ready.then(() => { fitQuote(); fitArticle(); });

async function init() {
  try { config = await request(`/api/config?${locationQuery()}`); } catch { /* Keep known initial defaults. */ }
  updateClock();
  for (const name of names) {
    const cached = readStored(name === 'news' ? 'glitch-feed-news-v2' : `glitch-feed-${name}`);
    // Weather cache belongs to a specific location/configuration.
    if (cached && cached.data && cached.updated_at && (!['weather', 'radar'].includes(name) || cached.configKey === options.postalCode)) {
      try {
        renderers[name](cached.data);
        records[name] = { ...cached, stale: true };
        if (name === 'news') openPendingArticle();
      } catch { /* Ignore invalid caches. */ }
    }
    refresh(name);
  }
  resetTimer();
  setInterval(() => { refresh('news'); refresh('weather'); refresh('radar'); }, 60000);
  setInterval(() => refresh('quote'), 90000);
  setInterval(() => { if (document.body.dataset.view === 'radar') showRadarFrame(radarFrameIndex + 1); }, 1200);
  setInterval(updateStatuses, 10000);
}
function animateProgress() {
  tick();
  requestAnimationFrame(animateProgress);
}
requestAnimationFrame(animateProgress);
setInterval(updateClock, 1000);
init();
