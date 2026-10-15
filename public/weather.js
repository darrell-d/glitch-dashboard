(function (root) {
  'use strict';
  const STYLES = ['fill', 'flat', 'line', 'monochrome'];

  function appearance(code, isDay = true) {
    if ([0, 1].includes(code)) return isDay ? 'sun' : 'moon';
    if (code === 2) return isDay ? 'partly-day' : 'partly-night';
    if (code === 3) return 'cloud';
    if ([45, 48].includes(code)) return 'fog';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ([95, 96, 99].includes(code)) return 'storm';
    return 'unknown';
  }
  function slug(code, isDay = true) {
    const kind = appearance(code, isDay);
    return {
      sun: 'clear-day', moon: 'clear-night', 'partly-day': 'partly-cloudy-day',
      'partly-night': 'partly-cloudy-night', cloud: 'overcast', fog: isDay ? 'fog-day' : 'fog-night',
      rain: 'rain', snow: 'snow', storm: isDay ? 'thunderstorms-day-rain' : 'thunderstorms-night-rain',
      unknown: 'not-available',
    }[kind];
  }
  function description(code) {
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
  function weekIndex(date) {
    const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return Math.floor((day - Date.UTC(1970, 0, 5)) / (7 * 86400000));
  }
  function styleForWeek(date = new Date()) {
    return STYLES[((weekIndex(date) % STYLES.length) + STYLES.length) % STYLES.length];
  }
  function resolveStyle(preference = 'weekly', date = new Date()) {
    return STYLES.includes(preference) ? preference : styleForWeek(date);
  }
  function namedUrl(name, style = 'fill') {
    return `/meteocons/${resolveStyle(style)}/${name}.svg`;
  }
  function iconUrl(code, isDay = true, style = 'fill') {
    return namedUrl(slug(code, isDay), style);
  }
  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#dce7d6';
  }
  function icon(code, isDay = true, style = 'fill', monochromeColor = '#dce7d6') {
    return named(slug(code, isDay), style, monochromeColor);
  }
  function named(name, style = 'fill', monochromeColor = '#dce7d6') {
    const resolved = resolveStyle(style);
    const url = namedUrl(name, resolved);
    if (resolved === 'monochrome') {
      return `<span class="meteocon-inline" data-meteocon-src="${url}" aria-hidden="true" style="color:${safeColor(monochromeColor)};--meteocon-url:url('${url}')"></span>`;
    }
    return `<img src="${url}" alt="" aria-hidden="true">`;
  }
  const svgCache = new Map();
  async function hydrate(root) {
    if (!root || typeof root.querySelectorAll !== 'function' || typeof fetch !== 'function') return;
    const icons = [...root.querySelectorAll('[data-meteocon-src]')];
    await Promise.all(icons.map(async (element) => {
      const url = element.dataset.meteoconSrc;
      try {
        if (!svgCache.has(url)) {
          svgCache.set(url, fetch(url).then((response) => {
            if (!response.ok) throw new Error('Icon unavailable');
            return response.text();
          }));
        }
        element.innerHTML = await svgCache.get(url);
        element.classList.add('hydrated');
      } catch { /* Keep the colored mask fallback. */ }
    }));
  }
  const api = { STYLES, appearance, slug, description, weekIndex, styleForWeek, resolveStyle,
    iconUrl, namedUrl, safeColor, icon, named, hydrate };
  if (typeof module !== 'undefined') module.exports = api;
  else root.WeatherVisual = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
