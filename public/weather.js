(function (root) {
  'use strict';
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
  function icon(code, isDay = true) {
    return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><use href="/weather-symbols.svg#${appearance(code, isDay)}"></use></svg>`;
  }
  const api = { appearance, description, icon };
  if (typeof module !== 'undefined') module.exports = api;
  else root.WeatherVisual = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
