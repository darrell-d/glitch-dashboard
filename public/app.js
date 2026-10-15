'use strict';

const $ = (id) => document.getElementById(id);
const names = ['news', 'weather', 'radar', 'quote'];
const panels = ['news', 'article', 'weather', 'radar', 'markets', 'quote', 'gallery', 'picture', 'media'];
const GALLERY_ROWS = 3;
const GALLERY_MIN_PHOTOS = 6;
// Photo-wall rows cycle standard, faster, slower; the standard pace is 14 seconds per photo.
const GALLERY_SECONDS_PER_PHOTO = 14;
const GALLERY_ROW_SPEEDS = [1, 1.5, 0.65];
const hasPhoto = (item) => typeof item.image_url === 'string' && item.image_url.startsWith('https://');
let screens = [{ panel: 'news', kind: 'article' }];
const records = {};
let config = { location: 'Local weather', region: '', postal_code: '19103', timezone: 'America/New_York' };
let options = { transition: 'fade', postalCode: '19103', weatherIconStyle: 'weekly', weatherIconColor: '#dce7d6' };
let current = 0;
// URLs already shown this cycle, so new stories go into the next batch.
let shownStories = new Set();
let shownPictures = new Set();
let shownMedia = new Set();
let shownCartoons = new Set();
let rotationState = { lastKind: '', newsGap: 0, weatherGap: 0 };
let mediaToken = 0;
let mediaFallbackTimer;
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
const SCREEN_DURATIONS = { article: 30, weather: 120, radar: 120, markets: 60, quote: 30, gallery: 300, picture: 20 };
const SCREEN_TYPES = Object.keys(SCREEN_DURATIONS);
const ROTATION_TYPES = Object.keys(DashboardEdition.DEFAULT_WEIGHTS);
function validDurations(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([screen, seconds]) =>
    SCREEN_TYPES.includes(screen) && Number.isInteger(seconds) && seconds >= 5 && seconds <= 3600));
}
let screenDurations = { ...SCREEN_DURATIONS, ...validDurations(readStored('glitch-screen-durations')) };
function validRotation(value) {
  if (!value || typeof value !== 'object' || !value.weights || typeof value.weights !== 'object') return null;
  const weights = Object.fromEntries(ROTATION_TYPES.map((screen) => [screen, Number(value.weights[screen])]));
  if (Object.values(weights).some((weight) => !Number.isInteger(weight) || weight < 0 || weight > 1000)
      || !Object.values(weights).some((weight) => weight > 0)) return null;
  const maxNewsGap = Number(value.max_news_gap);
  const maxWeatherGap = Number(value.max_weather_gap);
  if (![maxNewsGap, maxWeatherGap].every((gap) => Number.isInteger(gap) && gap >= 1 && gap <= 50)) return null;
  return { weights, maxNewsGap, maxWeatherGap };
}
let rotationConfig = validRotation(readStored('glitch-rotation')) || {
  weights: { ...DashboardEdition.DEFAULT_WEIGHTS }, ...DashboardEdition.DEFAULT_GUARDS };
const screenSeconds = (panel) => screenDurations[panel === 'news' ? 'article' : panel] || SCREEN_DURATIONS.article;
function applySettings(settings) {
  screenDurations = { ...SCREEN_DURATIONS, ...validDurations(settings?.screen_durations) };
  rotationConfig = validRotation(settings?.rotation) || rotationConfig;
  store('glitch-screen-durations', screenDurations);
  store('glitch-rotation', { weights: rotationConfig.weights, max_news_gap: rotationConfig.maxNewsGap,
    max_weather_gap: rotationConfig.maxWeatherGap });
}
async function loadSettings() {
  try { applySettings(await request('/api/settings')); } catch { /* Keep this browser's last known times. */ }
}
async function saveSettings(durations, rotation) {
  const response = await fetch('/api/settings', { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screen_durations: durations, rotation }) });
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
  // Start a stable weighted edition once stories are available; refreshes wait for the next edition.
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

// The weather screen is designed on a 1440×900 canvas; scale it to cover the viewport and
// let the forecast column absorb any extra width.
const WEATHER_DESIGN = { width: 1440, height: 900, leftColumn: 660, rightPadding: 128 };
function fitWeather() {
  const width = window.innerWidth || 1920;
  const height = window.innerHeight || 1080;
  const scale = Math.min(width / WEATHER_DESIGN.width, height / WEATHER_DESIGN.height);
  const canvas = $('weather-canvas');
  canvas.style.width = `${width / scale}px`;
  canvas.style.height = `${height / scale}px`;
  canvas.style.transform = `scale(${scale})`;
  return width / scale;
}
function weatherIcon(className, html) {
  const icon = node('span', `wx-icon ${className}`.trim());
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = html;
  return icon;
}
function renderWeather(data) {
  const { current: now, hourly, daily } = data;
  const iconStyle = WeatherVisual.resolveStyle(options.weatherIconStyle);
  const icon = (code, isDay) => WeatherVisual.icon(code, isDay, iconStyle, options.weatherIconColor);
  const canvasWidth = fitWeather();
  $('weather-heading').textContent = config.location;

  // Now: big temperature with the condition icon, condition, and three stats.
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: config.timezone }).format(new Date()));
  const isDay = now.is_day === 0 ? false : now.is_day === 1 ? true : hour >= 7 && hour < 19;
  const temperature = node('div', 'wx-temp');
  const reading = String(number(now.temperature_2m));
  // Three-character readings (100°+, -10° and below) step the numeral down so the icon keeps room.
  if (reading.length >= 3) temperature.dataset.wide = 'true';
  temperature.append(node('span', 'wx-temp-num', reading), node('span', 'wx-temp-unit', '°F'));
  const hero = weatherIcon('wx-hero', icon(now.weather_code, isDay));
  hero.dataset.kind = WeatherVisual.appearance(now.weather_code, isDay);
  hero.setAttribute('role', 'img');
  hero.removeAttribute('aria-hidden');
  hero.setAttribute('aria-label', `${condition(now.weather_code)}${isDay ? '' : ' at night'}`);
  const tempRow = node('div', 'wx-temp-row');
  tempRow.append(temperature, hero);
  const stats = node('div', 'wx-stats');
  for (const [label, value] of [['Feels', `${number(now.apparent_temperature)}°`],
    ['Humidity', `${number(now.relative_humidity_2m)}%`], ['Celsius', `${celsius(now.temperature_2m)}°`]]) {
    const stat = node('div', 'wx-stat');
    stat.append(node('span', 'wx-stat-label', label), node('span', 'wx-stat-value', value));
    stats.append(stat);
  }
  $('weather-content').replaceChildren(tempRow, node('div', 'wx-condition', condition(now.weather_code)), stats);

  // Next 12 hours: warmest hour at the top of the chart, coldest at the bottom.
  const hours = hourly.time.slice(0, 12).map((stamp, i) => ({ label: displayHour(stamp, i),
    temp: number(hourly.temperature_2m[i]), rain: number(hourly.precipitation_probability[i]),
    code: hourly.weather_code[i], day: hourly.is_day[i] !== 0 }));
  const chartWidth = Math.max(400, canvasWidth - WEATHER_DESIGN.leftColumn - WEATHER_DESIGN.rightPadding);
  const chartHeight = 190;
  const temps = hours.map((item) => item.temp);
  const high = Math.max(...temps);
  const low = Math.min(...temps);
  const points = hours.map((item, i) => ({ x: (i + 0.5) * chartWidth / hours.length,
    y: 50 + 110 * (high === low ? 0.5 : (high - item.temp) / (high - low)) }));
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const chart = node('div', 'wx-chart');
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', `Next 12 hours: ${hours.map((item) => `${item.label} ${item.temp}°`).join(', ')}`);
  chart.innerHTML = `<svg width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}" aria-hidden="true">
    <defs><linearGradient id="wx-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e6d8" stop-opacity=".16"/><stop offset="1" stop-color="#e9e6d8" stop-opacity="0"/></linearGradient></defs>
    <polygon fill="url(#wx-chart-fill)" points="${points[0].x.toFixed(1)},${chartHeight} ${line} ${points.at(-1).x.toFixed(1)},${chartHeight}"/>
    <polyline class="wx-chart-line" points="${line}"/></svg>`;
  const columns = node('div', 'wx-chart-cols');
  hours.forEach((item, i) => {
    const column = node('div', 'wx-chart-col');
    const label = node('div', 'wx-chart-temp', `${item.temp}°`);
    label.style.top = `${points[i].y - 34}px`;
    const dot = node('div', 'wx-chart-dot');
    dot.style.top = `${points[i].y}px`;
    column.append(label, dot);
    columns.append(column);
  });
  chart.append(columns);
  const meta = node('div', 'wx-hour-meta');
  hours.forEach((item) => {
    const cell = node('div', 'wx-hour');
    cell.setAttribute('aria-label', `${item.label}: ${condition(item.code)}, ${item.temp}°F, ${item.rain}% chance of precipitation`);
    const rain = node('span', 'wx-hour-pop', `${item.rain}%`);
    if (item.rain >= 30) rain.dataset.wet = 'true';
    cell.append(weatherIcon('', icon(item.code, item.day)), node('span', 'wx-hour-label', item.label), rain);
    meta.append(cell);
  });
  $('weather-hourly').replaceChildren(chart, meta);

  // Five days: every bar shares one scale, from the week's coldest low to its hottest high.
  const weekLow = Math.min(...daily.temperature_2m_min.map(number));
  const weekHigh = Math.max(...daily.temperature_2m_max.map(number));
  const span = Math.max(1, weekHigh - weekLow);
  $('weather-days').replaceChildren(...daily.time.map((day, i) => {
    const dayHigh = number(daily.temperature_2m_max[i]);
    const dayLow = number(daily.temperature_2m_min[i]);
    const name = i === 0 ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
    const row = node('div', 'wx-day');
    const range = node('div', 'wx-range');
    range.setAttribute('role', 'img');
    range.setAttribute('aria-label', `${name}: low ${dayLow}°, high ${dayHigh}° (week ${weekLow}°–${weekHigh}°)`);
    const fill = node('div', 'wx-range-fill');
    fill.style.left = `${(dayLow - weekLow) / span * 100}%`;
    fill.style.width = `${(dayHigh - dayLow) / span * 100}%`;
    range.append(fill);
    row.append(node('span', 'wx-day-name', name), weatherIcon('', icon(daily.weather_code[i], true)),
      node('span', 'wx-day-cond', condition(daily.weather_code[i])), node('span', 'wx-day-lo', `${dayLow}°`),
      range, node('span', 'wx-day-hi', `${dayHigh}°`));
    return row;
  }));

  ticker = { ...ticker, data, iconStyle, ids: '' };
  updateTicker();
  WeatherVisual.hydrate($('weather'));
}

// Ticker: a 60px window sliding up through warnings, air quality, the next sky event, wind, and
// the moon. It keeps its place across the minute-by-minute weather re-render.
const TICKER_ROW = 60;
let ticker = { data: null, iconStyle: 'fill', ids: '', items: [], index: 0, shownAt: 0 };
function tickerRow(item) {
  const row = node('div', 'wx-ticker-item');
  row.dataset.kind = item.kind;
  if (item.severity) row.dataset.severity = item.severity;
  row.setAttribute('aria-label', item.label);
  const text = node('div', 'wx-ticker-text');
  text.append(node('span', 'wx-ticker-kicker', item.kicker), node('span', 'wx-ticker-title', item.title));
  if (item.sub) text.append(node('span', 'wx-ticker-sub', item.sub));
  row.append(weatherIcon('wx-ticker-lead', WeatherVisual.named(item.icon, ticker.iconStyle, options.weatherIconColor)), text);
  if (item.trail) row.append(weatherIcon('wx-ticker-trail', WeatherVisual.named(item.trail, ticker.iconStyle, options.weatherIconColor)));
  return row;
}
function moveTicker(index, animate = true) {
  const track = $('weather-ticker');
  track.classList.toggle('instant', !animate);
  track.style.transform = `translateY(${-index * TICKER_ROW}px)`;
  ticker.index = index;
  const current = index % Math.max(1, ticker.items.length);
  [...$('weather-ticker-dots').children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
  // After sliding onto the copy of the first item, jump back to the real one without animation.
  if (index === ticker.items.length && index > 0) setTimeout(() => { if (ticker.index === index) moveTicker(0, false); }, 750);
}
function updateTicker() {
  if (!ticker.data) return;
  const now = Date.now();
  const localDay = new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: config.timezone }).format(new Date(now));
  const items = WeatherSignals.tickerItems(now, ticker.data, config, MoonPhase, config.timezone,
    WeatherVisual, `${config.postal_code}:${localDay}`);
  const ids = items.map(WeatherSignals.key).join('\n');
  const currentKey = ticker.items.length ? WeatherSignals.key(ticker.items[ticker.index % ticker.items.length]) : '';
  if (ids !== ticker.ids) {
    // The set of items changed (or the screen re-rendered): rebuild, staying on the same item if it remains.
    const keep = Math.max(0, items.findIndex((item) => WeatherSignals.key(item) === currentKey));
    Object.assign(ticker, { ids, items });
    const rows = items.map(tickerRow);
    if (items.length > 1) rows.push(tickerRow(items[0]));
    $('weather-ticker').replaceChildren(...rows);
    $('weather-ticker-dots').replaceChildren(...items.map((item, i) => {
      const dot = node('button', 'wx-ticker-dot');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Show ${item.kicker}`);
      dot.addEventListener('click', () => { ticker.shownAt = Date.now(); moveTicker(i); });
      return dot;
    }));
    moveTicker(keep, false);
    WeatherVisual.hydrate($('weather-ticker'));
    return;
  }
  // Same items: refresh changing text such as "in 42 min" in place.
  items.forEach((item, i) => {
    for (const row of [i, i === 0 && items.length > 1 ? items.length : -1].map((r) => $('weather-ticker').children[r]).filter(Boolean)) {
      const sub = row.children[1].children[2];
      if (sub && sub.textContent !== item.sub) sub.textContent = item.sub;
    }
  });
  ticker.items = items;
  if (items.length > 1 && now - ticker.shownAt >= WeatherSignals.ROTATE_MS) {
    ticker.shownAt = now;
    moveTicker(ticker.index % items.length + 1);
  }
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
  const backdrop = $('picture-backdrop');
  // A larger rendition can be refused (e.g. a picture narrower than the requested width); fall back once.
  image.onerror = () => {
    image.onerror = null;
    if (photo.fallback_url && image.src !== photo.fallback_url) image.src = backdrop.src = photo.fallback_url;
  };
  backdrop.src = photo.url;
  image.src = photo.url;
  image.alt = photo.title;
  $('picture-kicker').textContent = photo.kicker;
  $('picture-caption').textContent = photo.title;
  $('picture-description').textContent = photo.description;
  $('picture-credit').textContent = photo.credit ? `Image: ${photo.credit}` : '';
}
// Video sound: M toggles it; remembered on this browser. Browsers block audio until the viewer
// interacts, so an unmuted start that is refused falls back to muted playback.
let soundOn = readStored('glitch-video-sound') === true;
let mediaDurationHint = 0;
function showSoundState(blocked = false) {
  $('media-sound').textContent = soundOn && !blocked ? 'Sound on · press M to mute'
    : blocked ? 'Muted until you interact · press M for sound' : 'Muted · press M for sound';
}
function formatMediaTime(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
function updateMediaProgress() {
  const video = $('media-video');
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : mediaDurationHint;
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const ready = duration > 0;
  const remaining = ready ? Math.max(0, duration - current) : 0;
  $('media-progress-remaining').style.transform = `scaleX(${ready ? Math.min(1, remaining / duration) : 0})`;
  $('media-time-remaining').textContent = ready ? `${formatMediaTime(remaining)} left` : '';
  $('media-progress').dataset.ready = String(ready);
  $('media-progress').setAttribute('aria-valuemax', String(ready ? Math.ceil(duration) : 0));
  $('media-progress').setAttribute('aria-valuenow', String(Math.ceil(remaining)));
  $('media-progress').setAttribute('aria-label', ready ? `${formatMediaTime(remaining)} remaining` : 'Video duration loading');
}
function startVideo(video) {
  video.muted = !soundOn;
  showSoundState();
  const playback = video.play();
  if (!playback?.catch) return;
  playback.catch(() => {
    if (video.muted) return; // The fallback timer advances if even muted autoplay is unavailable.
    video.muted = true;
    showSoundState(true);
    video.play()?.catch?.(() => {});
  });
}
function toggleSound() {
  soundOn = !soundOn;
  store('glitch-video-sound', soundOn);
  const video = $('media-video');
  video.muted = !soundOn;
  showSoundState();
  if (screens[current]?.panel === 'media' && video.paused) video.play()?.catch?.(() => {});
}
function renderMedia(item) {
  const video = $('media-video');
  const token = ++mediaToken;
  clearTimeout(mediaFallbackTimer);
  $('media-backdrop').src = item.poster || '';
  video.pause();
  video.poster = item.poster || '';
  video.src = item.url;
  video.type = item.type || 'video/webm';
  mediaDurationHint = Number.isFinite(Number(item.duration)) ? Number(item.duration) : 0;
  video.onloadedmetadata = updateMediaProgress;
  video.ondurationchange = updateMediaProgress;
  video.ontimeupdate = updateMediaProgress;
  updateMediaProgress();
  $('media-kicker').textContent = item.kicker || 'Wikimedia media of the day';
  $('media-caption').textContent = item.title || '';
  $('media-credit').textContent = item.credit || '';
  const advance = () => {
    if (token === mediaToken && screens[current]?.panel === 'media') showPanel(current + 1);
  };
  // Pausing stops the rotation, not the video: while paused, a finished video replays instead of advancing.
  video.onended = () => (paused ? video.play() : advance());
  video.onerror = () => { if (!paused) advance(); };
  video.onplaying = () => clearTimeout(mediaFallbackTimer);
  if (!paused) mediaFallbackTimer = setTimeout(advance, 15000);
  startVideo(video);
}
async function refreshPictures() {
  try {
    const value = await request('/api/pictures');
    if (value.data?.photos || value.data?.videos || value.data?.cartoons) records.pictures = value;
  } catch { /* Picture screens are optional; skip them until the feed is available. */ }
}
function nextEdition(items) {
  const photos = items.filter(hasPhoto);
  const gallery = photos.length >= GALLERY_MIN_PHOTOS;
  const dayPictures = records.pictures?.data?.photos || [];
  const dayMedia = records.pictures?.data?.videos || [];
  const cartoons = records.pictures?.data?.cartoons || [];
  const plan = DashboardEdition.createSchedule({ weights: rotationConfig.weights,
    maxNewsGap: rotationConfig.maxNewsGap, maxWeatherGap: rotationConfig.maxWeatherGap,
    state: rotationState, availability: { article: items.length > 0, gallery,
      picture: dayPictures.length > 0, cartoon: cartoons.length > 0, media: dayMedia.length > 0 } });
  rotationState = plan.state;
  const count = (kind) => plan.kinds.filter((item) => item === kind).length;
  const batch = DashboardEdition.pickCycle(items, shownStories, count('article'));
  shownStories = batch.shown;
  const pictureBatch = DashboardEdition.pickCycle(DashboardEdition.shuffle(dayPictures), shownPictures, count('picture'));
  shownPictures = pictureBatch.shown;
  pictureBatch.items.forEach((photo) => { const preload = new Image(); preload.src = photo.url; });
  const mediaBatch = DashboardEdition.pickCycle(DashboardEdition.shuffle(dayMedia), shownMedia, count('media'));
  shownMedia = mediaBatch.shown;
  mediaBatch.items.forEach((item) => { if (item.poster) { const preload = new Image(); preload.src = item.poster; } });
  const cartoonBatch = DashboardEdition.pickCycle(DashboardEdition.shuffle(cartoons), shownCartoons, count('cartoon'));
  shownCartoons = cartoonBatch.shown;
  cartoonBatch.items.forEach((cartoon) => { const preload = new Image(); preload.src = cartoon.url; });
  screens = DashboardEdition.createEdition(batch.items, { schedule: plan.kinds,
    pictures: pictureBatch.items, media: mediaBatch.items, cartoons: cartoonBatch.items });
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
  const previousPanel = screens[current]?.panel;
  if (index >= screens.length) {
    if (records.news) {
      nextEdition(records.news.data.items);
      current = 0;
    }
    index = 0;
  }
  current = (index + screens.length) % screens.length;
  const screen = screens[current];
  if (previousPanel === 'media' && screen.panel !== 'media') {
    mediaToken += 1;
    clearTimeout(mediaFallbackTimer);
    $('media-video').pause();
  }
  document.body.dataset.view = screen.panel;
  document.querySelector('.footer').inert = ['article', 'media'].includes(screen.panel);
  panels.forEach((name) => {
    const active = name === screen.panel;
    $(name).classList.toggle('active', active);
    $(name).inert = !active;
    $(name).setAttribute('aria-hidden', String(!active));
  });
  if (screen.panel === 'article') renderArticle(screen);
  if (screen.panel === 'picture') renderPicture(screen.item);
  if (screen.panel === 'media') renderMedia(screen.item);
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
  if (screens[current]?.panel === 'media') {
    if (paused) { clearTimeout(mediaFallbackTimer); $('media-video').pause(); }
    else $('media-video').play().catch(() => {});
  }
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('paper-pause').textContent = paused ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-label', paused ? 'Resume rotation' : 'Pause rotation');
}
function tick() {
  if (screens[current]?.panel === 'media') {
    updateMediaProgress();
    $('progress').style.transform = 'scaleX(0)';
    $('article-progress').style.transform = 'scaleX(0)';
    return;
  }
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
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: config.timezone })
      .formatToParts(now).map((part) => [part.type, part.value]));
    $('date').textContent = `${parts.weekday} · ${parts.month} ${parts.day}`;
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
  ROTATION_TYPES.forEach((screen) => { $(`weight-${screen}`).value = rotationConfig.weights[screen]; });
  $('max-news-gap').value = rotationConfig.maxNewsGap;
  $('max-weather-gap').value = rotationConfig.maxWeatherGap;
  showSettingsTab('display');
  $('transition').value = options.transition;
  $('postal-code').value = options.postalCode;
  $('weather-icon-style').value = options.weatherIconStyle;
  $('weather-icon-color').value = options.weatherIconColor;
  $('settings-dialog').returnValue = '';
  $('settings-dialog').showModal();
});
function showSettingsTab(name) {
  for (const tab of ['display', 'times', 'rotation']) {
    const selected = tab === name;
    $(`settings-tab-${tab}`).setAttribute('aria-selected', String(selected));
    $(`settings-tab-${tab}`).tabIndex = selected ? 0 : -1;
    $(`settings-panel-${tab}`).hidden = !selected;
  }
}
$('settings-tab-display').addEventListener('click', () => showSettingsTab('display'));
$('settings-tab-times').addEventListener('click', () => showSettingsTab('times'));
$('settings-tab-rotation').addEventListener('click', () => showSettingsTab('rotation'));
$('settings-dialog').addEventListener('close', async () => {
  if ($('settings-dialog').returnValue === 'save') {
    const durations = Object.fromEntries(SCREEN_TYPES.map((screen) => [screen, Number($(`time-${screen}`).value)]));
    const rotation = { weights: Object.fromEntries(ROTATION_TYPES.map((screen) =>
      [screen, Number($(`weight-${screen}`).value)])), max_news_gap: Number($('max-news-gap').value),
      max_weather_gap: Number($('max-weather-gap').value) };
    if (Object.keys(validDurations(durations)).length === SCREEN_TYPES.length && validRotation(rotation)) {
      try {
        await saveSettings(durations, rotation);
        $('screen-times-status').textContent = '';
      } catch {
        applySettings({ screen_durations: durations, rotation });
        $('screen-times-status').textContent = 'The server could not save these settings; they apply on this browser only.';
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
  else if (event.key.toLowerCase() === 'm') toggleSound();
});
window.addEventListener('resize', () => {
  fitQuote(); fitArticle();
  if (records.weather?.data) renderWeather(records.weather.data);
  if (records.radar?.data) renderRadar(records.radar.data);
});
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
  await loadSettings();
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
  await refreshPictures();
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
setInterval(updateTicker, 1000);
init();
