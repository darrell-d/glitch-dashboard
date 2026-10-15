'use strict';

const $ = (id) => document.getElementById(id);
const names = ['news', 'weather', 'radar', 'quote'];
const panels = ['news', 'article', 'weather', 'radar', 'markets', 'quote', 'gallery', 'picture'];
const GALLERY_ROWS = 3;
const GALLERY_MIN_PHOTOS = 6;
// Photo-wall rows cycle standard, faster, slower; the standard pace is 14 seconds per photo.
const GALLERY_SECONDS_PER_PHOTO = 14;
const GALLERY_ROW_SPEEDS = [1, 1.5, 0.65];
const hasPhoto = (item) => typeof item.image_url === 'string' && item.image_url.startsWith('https://');
let screens = DashboardEdition.createEdition([]);
const records = {};
let config = { location: 'Local weather', region: '', postal_code: '19103', timezone: 'America/New_York' };
let options = { transition: 'fade', postalCode: '19103', weatherIconStyle: 'weekly', weatherIconColor: '#dce7d6' };
let current = 0;
// URLs already shown this cycle, so new stories go into the next batch.
let shownStories = new Set();
let shownPictures = new Set();
let paused = false;
let started = performance.now();
let elapsed = 0;
let pendingArticle = location.hash === '#article';

function readStored(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be disabled. */ }
}
function validOptions(value) {
  return value && ['fade', 'slide', 'none'].includes(value.transition)
    && (value.postalCode === undefined || /^\d{5}(?:-\d{4})?$/.test(value.postalCode))
    && (value.weatherIconStyle === undefined || ['weekly', ...WeatherVisual.STYLES].includes(value.weatherIconStyle))
    && (value.weatherIconColor === undefined || /^#[0-9a-f]{6}$/i.test(value.weatherIconColor));
}
// Seconds per kind of screen. The server keeps the shared values; this browser keeps a copy.
const SCREEN_DURATIONS = { article: 30, weather: 30, radar: 30, markets: 60, quote: 30, gallery: 300, picture: 20 };
const SCREEN_TYPES = Object.keys(SCREEN_DURATIONS);
function validDurations(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([screen, seconds]) =>
    SCREEN_TYPES.includes(screen) && Number.isInteger(seconds) && seconds >= 5 && seconds <= 3600));
}
let screenDurations = { ...SCREEN_DURATIONS, ...validDurations(readStored('glitch-screen-durations')) };
const screenSeconds = (panel) => screenDurations[panel === 'news' ? 'article' : panel] || SCREEN_DURATIONS.article;
function applySettings(settings) {
  screenDurations = { ...SCREEN_DURATIONS, ...validDurations(settings?.screen_durations) };
  store('glitch-screen-durations', screenDurations);
}
async function loadSettings() {
  try { applySettings(await request('/api/settings')); } catch { /* Keep this browser's last known times. */ }
}
async function saveSettings(durations) {
  const response = await fetch('/api/settings', { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screen_durations: durations }) });
  if (!response.ok) throw new Error('Settings not saved');
  applySettings(await response.json());
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
  nextEdition(data.items);
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
  const hasImage = hasPhoto(item);
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
  details.append(node('div', '', `Humidity ${number(now.relative_humidity_2m)}%`));
  const signal = node('div', 'weather-signal');
  signal.setAttribute('aria-live', 'polite');
  conditions.append(details, signal);
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
  signalSlot = { ...signalSlot, element: signal, data, current: null, iconStyle };
  updateWeatherSignal();
  WeatherVisual.hydrate(content);
}

// The slot keeps its rotation position across the minute-by-minute weather re-render.
let signalSlot = { id: '', shownAt: 0 };
const signalId = (item) => `${item.icon}|${item.title}`;
function signalItem(item) {
  const element = node('div', 'signal-item');
  element.dataset.kind = item.kind;
  if (item.severity) element.dataset.severity = item.severity;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', item.label);
  const icons = node('span', 'signal-icons');
  icons.setAttribute('aria-hidden', 'true');
  for (const iconName of item.icons || [item.icon]) {
    const icon = node('span', 'signal-icon');
    icon.innerHTML = WeatherVisual.named(iconName, signalSlot.iconStyle, options.weatherIconColor);
    icons.append(icon);
  }
  const text = node('div', 'signal-text');
  text.append(node('div', 'signal-title', item.title), node('div', 'signal-detail', item.detail));
  element.append(icons, text);
  return element;
}
function updateWeatherSignal() {
  if (!signalSlot.element) return;
  const now = Date.now();
  const localDay = new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: config.timezone }).format(new Date(now));
  const items = WeatherSignals.items(now, signalSlot.data, config, MoonPhase, config.timezone,
    WeatherVisual, `${config.postal_code}:${localDay}`);
  const found = items.findIndex((item) => signalId(item) === signalSlot.id);
  const due = now - signalSlot.shownAt >= WeatherSignals.ROTATE_MS;
  const index = found < 0 ? 0 : items.length > 1 && due ? (found + 1) % items.length : found;
  const item = items[index];
  if (signalSlot.current && index === found) {
    // Same item: refresh countdown text such as "in 42 min" without animating.
    const detail = signalSlot.current.children[1].children[1];
    if (detail.textContent !== item.detail) detail.textContent = item.detail;
    signalSlot.current.setAttribute('aria-label', item.label);
    return;
  }
  const incoming = signalItem(item);
  const outgoing = signalSlot.current;
  if (outgoing) {
    outgoing.classList.add('leaving');
    incoming.classList.add('entering');
    signalSlot.element.append(incoming);
    const container = signalSlot.element;
    setTimeout(() => {
      if (container !== signalSlot.element || incoming !== signalSlot.current) return;
      outgoing.remove();
      incoming.classList.remove('entering');
    }, 800);
  } else signalSlot.element.replaceChildren(incoming);
  if (index !== found) signalSlot.shownAt = now;
  Object.assign(signalSlot, { current: incoming, id: signalId(item) });
  WeatherVisual.hydrate(incoming);
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
  const frame = radarFrames[radarFrameIndex];
  const stamp = new Date(frame.time * 1000);
  $('radar').dataset.mode = frame.kind;
  $('radar-mode').textContent = frame.kind === 'forecast' ? `FORECAST · +${frame.leadHours}H` : 'OBSERVED';
  $('radar-legend').setAttribute('aria-label', `${frame.kind === 'forecast' ? 'Forecast precipitation' : 'Observed radar'} intensity from light to heavy`);
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
  const observedFrames = data.frames.map((frame) => {
    const layer = node('div', 'radar-layer radar-precipitation');
    RadarMap.tileLayout(latitude, longitude, width, height, 7, 512).forEach((tile) =>
      radarTile(layer, tile, 512, ({ x, y }) => `${data.host}${frame.path}/512/7/${x}/${y}/2/1_1.png`));
    return { layer, time: frame.time, kind: 'observed' };
  });
  const forecastFrames = RadarMap.forecastFrames(Date.now(), 6).map((frame) => {
    const layer = node('div', 'radar-layer radar-precipitation radar-forecast');
    RadarMap.tileLayout(latitude, longitude, width, height, 6, 1024).forEach((tile) =>
      radarTile(layer, tile, 1024, ({ x, y }) =>
        `https://weathermaps.weatherapi.com/precip/tiles/${frame.stamp}/6/${x}/${y}.png`));
    return { ...frame, layer, kind: 'forecast' };
  });
  radarFrames = [...observedFrames, ...forecastFrames];
  map.replaceChildren(base, ...radarFrames.map((frame) => frame.layer));
  const labels = [];
  const currentTemperature = records.weather?.data?.current?.temperature_2m;
  if (Number.isFinite(currentTemperature)) {
    labels.push({ name: config.location, temperature: currentTemperature, latitude, longitude, home: true });
  }
  labels.push(...(data.cities || data.stations || []).map((city) => ({ ...city, home: false })));
  const occupied = [];
  $('radar-temperatures').replaceChildren(...labels.flatMap((city) => {
    const point = RadarMap.viewportPoint(city.latitude, city.longitude,
      latitude, longitude, width, height, 8, 256);
    if (point.x < 70 || point.x > width - 70 || point.y < 120 || point.y > height - 90) return [];
    if (!city.home && occupied.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 110)) return [];
    occupied.push(point);
    const label = node('div', `radar-temperature${city.home ? ' home' : ''}`);
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
    label.append(node('span', '', city.name), node('strong', '', `${number(city.temperature)}°`));
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
function renderPicture(photo) {
  const image = $('picture-image');
  $('picture-backdrop').src = photo.url;
  image.src = photo.url;
  image.alt = photo.title;
  $('picture-kicker').textContent = photo.kicker;
  $('picture-caption').textContent = photo.title;
  $('picture-description').textContent = photo.description;
  $('picture-credit').textContent = photo.credit ? `Image: ${photo.credit}` : '';
}
async function refreshPictures() {
  try {
    const value = await request('/api/pictures');
    if (value.data?.photos) records.pictures = value;
  } catch { /* Picture screens are optional; skip them until the feed is available. */ }
}
function nextEdition(items) {
  const batch = DashboardEdition.pickStories(items, shownStories);
  shownStories = batch.shown;
  const photos = items.filter(hasPhoto);
  const gallery = photos.length >= GALLERY_MIN_PHOTOS;
  // NASA pictures: a few shuffled, not-yet-shown photos dropped into random gaps.
  const dayPictures = records.pictures?.data?.photos || [];
  const pictureBatch = DashboardEdition.pickStories(DashboardEdition.shuffle(dayPictures), shownPictures,
    Math.min(DashboardEdition.PICTURES_PER_BATCH, dayPictures.length));
  shownPictures = pictureBatch.shown;
  pictureBatch.items.forEach((photo) => { const preload = new Image(); preload.src = photo.url; });
  screens = DashboardEdition.createEdition(batch.items, { gallery, pictures: pictureBatch.items });
  // Build the photo wall with the batch so its images load well before it appears.
  if (gallery) renderGallery(photos);
}
function renderGallery(photos) {
  const rows = Array.from({ length: GALLERY_ROWS }, (_, row) => photos.filter((_, i) => i % GALLERY_ROWS === row));
  $('gallery-rows').replaceChildren(...rows.filter((row) => row.length).map((items, row) => {
    // Repeat short rows so one set is wider than the screen, then double it for a seamless loop.
    while (items.length < 8) items = items.concat(items);
    const track = node('div', 'gallery-track');
    track.style.animationDuration = `${Math.round(items.length * GALLERY_SECONDS_PER_PHOTO / GALLERY_ROW_SPEEDS[row % GALLERY_ROW_SPEEDS.length])}s`;
    [...items, ...items].forEach((item, i) => {
      const tile = node('figure', 'gallery-tile');
      const image = node('img');
      image.alt = i < items.length ? item.title : '';
      if (i >= items.length) tile.setAttribute('aria-hidden', 'true');
      image.decoding = 'async';
      image.onerror = () => { tile.hidden = true; };
      image.src = item.image_url;
      tile.append(image);
      track.append(tile);
    });
    const element = node('div', 'gallery-row');
    element.append(track);
    return element;
  }));
}
function showPanel(index) {
  if (index >= screens.length) {
    if (records.news) {
      nextEdition(records.news.data.items);
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
  if (screen.panel === 'picture') renderPicture(screen.item);
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
  const total = screenSeconds(screens[current]?.panel) * 1000;
  let used = elapsed + (paused ? 0 : performance.now() - started);
  if (used >= total && !paused) { showPanel(current + 1); used = 0; }
  // No numeric countdown on the display; only show a paused marker.
  const countdown = paused ? 'Ⅱ' : '';
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
  SCREEN_TYPES.forEach((screen) => { $(`time-${screen}`).value = screenDurations[screen]; });
  showSettingsTab('display');
  $('transition').value = options.transition;
  $('postal-code').value = options.postalCode;
  $('weather-icon-style').value = options.weatherIconStyle;
  $('weather-icon-color').value = options.weatherIconColor;
  $('settings-dialog').returnValue = '';
  $('settings-dialog').showModal();
});
function showSettingsTab(name) {
  for (const tab of ['display', 'times']) {
    const selected = tab === name;
    $(`settings-tab-${tab}`).setAttribute('aria-selected', String(selected));
    $(`settings-tab-${tab}`).tabIndex = selected ? 0 : -1;
    $(`settings-panel-${tab}`).hidden = !selected;
  }
}
$('settings-tab-display').addEventListener('click', () => showSettingsTab('display'));
$('settings-tab-times').addEventListener('click', () => showSettingsTab('times'));
$('settings-dialog').addEventListener('close', async () => {
  if ($('settings-dialog').returnValue === 'save') {
    const durations = Object.fromEntries(SCREEN_TYPES.map((screen) => [screen, Number($(`time-${screen}`).value)]));
    if (Object.keys(validDurations(durations)).length === SCREEN_TYPES.length) {
      try {
        await saveSettings(durations);
        $('screen-times-status').textContent = '';
      } catch {
        applySettings({ screen_durations: durations });
        $('screen-times-status').textContent = 'The server could not save these times; they apply on this browser only.';
      }
      resetTimer();
    }
    const value = { transition: $('transition').value,
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

// TradingView's free, embeddable heatmap: it loads its own live data inside an iframe.
const MARKETS_WIDGET = {
  dataSource: 'SPX500', grouping: 'sector', blockSize: 'market_cap_basic', blockColor: 'change',
  locale: 'en', colorTheme: 'dark', isTransparent: true, hasTopBar: false, isDataSetEnabled: false,
  isZoomEnabled: false, hasSymbolTooltip: false, isMonoSize: false, width: '100%', height: '100%',
};
function renderMarkets() {
  const container = node('div', 'tradingview-widget-container');
  const widget = node('div', 'tradingview-widget-container__widget');
  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
  script.async = true;
  script.textContent = JSON.stringify(MARKETS_WIDGET);
  container.append(widget, script);
  $('markets-widget').replaceChildren(container);
}

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
  renderMarkets();
  await Promise.all([loadSettings(), refreshPictures()]);
  resetTimer();
  setInterval(() => { refresh('news'); refresh('weather'); refresh('radar'); loadSettings(); refreshPictures(); }, 60000);
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
setInterval(updateWeatherSignal, 1000);
init();
