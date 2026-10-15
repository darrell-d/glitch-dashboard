(function (root) {
  'use strict';

  // The weather ticker: warnings first, then air quality, the next rise or set, wind, and the moon.
  const UV_THRESHOLD = 6;
  const AQI_THRESHOLD = 101;
  const ROTATE_MS = 10000;

  function localTime(stamp, offsetSeconds) {
    // Open-Meteo daily times are local wall-clock strings such as 2026-10-14T07:10.
    if (typeof stamp !== 'string' || !Number.isFinite(offsetSeconds)) return null;
    const time = Date.parse(`${stamp}:00Z`) - offsetSeconds * 1000;
    return Number.isFinite(time) ? time : null;
  }

  function duration(milliseconds) {
    const minutes = Math.max(1, Math.round(milliseconds / 60000));
    const hours = Math.floor(minutes / 60);
    if (!hours) return `in ${minutes} min`;
    return `in ${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  }

  // The next sunrise, sunset, or moonrise, whichever comes first; always present when data allows.
  function nextSkyEvent(now, weather, place, moon) {
    const daily = weather.daily || {};
    const offset = weather.utc_offset_seconds;
    const events = [];
    (daily.time || []).forEach((_, i) => {
      events.push({ kind: 'sunrise', title: 'Sunrise', time: localTime(daily.sunrise?.[i], offset) });
      events.push({ kind: 'sunset', title: 'Sunset', time: localTime(daily.sunset?.[i], offset) });
    });
    if (Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude)) {
      const rise = moon.nextRise(new Date(now), place.latitude, place.longitude, 36);
      if (rise) events.push({ kind: 'moonrise', title: 'Moonrise', time: rise.valueOf() });
    }
    const next = events.filter((event) => Number.isFinite(event.time) && event.time > now)
      .sort((a, b) => a.time - b.time)[0];
    if (!next) return null;
    const detail = duration(next.time - now);
    return { ...next, icon: next.kind, detail, label: `${next.title} ${detail}` };
  }

  function alertIcon(event) {
    const rules = [
      [/tornado/i, 'tornado-alert'], [/hurricane|tropical|typhoon|storm surge/i, 'hurricane-alert'],
      [/fire|red flag/i, 'fire-alert'], [/smoke/i, 'smoke'], [/air quality|air stagnation|ashfall/i, 'smoke'],
      [/heat/i, 'thermometer-warmer'], [/cold|freeze|frost|wind chill/i, 'thermometer-colder'],
      [/winter|blizzard|snow|ice|sleet/i, 'snowflake'], [/flood|surf|rip current|tsunami|coastal|marine/i, 'water-alert'],
      [/dust/i, 'dust'], [/wind|gale/i, 'wind-alert'], [/pollen/i, 'pollen'],
    ];
    return (rules.find(([pattern]) => pattern.test(event)) || [null, 'weather-alert'])[1];
  }

  function aqiCategory(aqi) {
    if (aqi > 300) return 'Hazardous';
    if (aqi > 200) return 'Very unhealthy';
    if (aqi > 150) return 'Unhealthy';
    if (aqi > 100) return 'Unhealthy for sensitive groups';
    if (aqi > 50) return 'Moderate';
    return 'Good';
  }

  function uvCategory(uv) {
    if (uv >= 11) return 'Extreme';
    if (uv >= 8) return 'Very high';
    if (uv >= 6) return 'High';
    return 'Moderate';
  }

  function until(stamp, now, timeZone) {
    const end = Date.parse(stamp);
    if (!Number.isFinite(end)) return '';
    const sameDay = end - now < 20 * 3600000;
    try {
      return `Until ${new Intl.DateTimeFormat('en-US', { ...(sameDay ? {} : { weekday: 'short' }),
        hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(end)).replace(':00', '')}`;
    } catch { return ''; }
  }

  function alerts(now, weather, timeZone) {
    const list = [];
    for (const alert of weather.alerts || []) {
      const ends = Date.parse(alert.ends);
      if (!alert.event || (Number.isFinite(ends) && ends <= now)) continue;
      const detail = until(alert.ends, now, timeZone);
      list.push({ kind: 'alert', icon: alertIcon(alert.event), title: alert.event, detail,
        severity: alert.severity, label: `${alert.event}${detail ? `, ${detail.toLowerCase()}` : ''}` });
    }
    const aqi = weather.air_quality?.us_aqi;
    if (Number.isFinite(aqi) && aqi >= AQI_THRESHOLD && !list.some((item) => item.icon === 'smoke')) {
      list.push({ kind: 'alert', source: 'aqi', icon: 'smoke', title: `Air quality ${aqi}`, detail: aqiCategory(aqi),
        severity: aqi > 150 ? 'Severe' : 'Moderate', label: `Air quality index ${aqi}, ${aqiCategory(aqi)}` });
    }
    const level = Math.round(weather.current?.uv_index);
    if (level >= UV_THRESHOLD) {
      list.push({ kind: 'alert', icon: level > 11 ? 'uv-index-11-plus' : `uv-index-${level}`, title: `UV index ${level}`,
        detail: uvCategory(level), severity: level >= 8 ? 'Severe' : 'Moderate', label: `UV index ${level}, ${uvCategory(level)}` });
    }
    return list;
  }

  const DIRECTION_NAMES = { n: 'North', ne: 'Northeast', e: 'East', se: 'Southeast',
    s: 'South', sw: 'Southwest', w: 'West', nw: 'Northwest' };

  function clock(time, timeZone) {
    try {
      return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(time));
    } catch { return ''; }
  }

  function wind(weather, weatherVisual, seed = '') {
    const speed = weather.current?.wind_speed_10m;
    if (!Number.isFinite(speed) || !weatherVisual) return null;
    const direction = weatherVisual.windDirection(weather.current?.wind_direction_10m);
    const rounded = Math.round(speed);
    const name = direction ? DIRECTION_NAMES[direction] : speed < 12 ? 'Light' : speed < 25 ? 'Moderate' : 'Strong';
    const strength = weatherVisual.windStrengthIcon(speed, seed);
    // Direction leads; the strength icon follows the text (it leads instead when direction is unknown).
    return { kind: 'wind', icon: direction ? `wind-direction-${direction}` : strength, trail: direction ? strength : '',
      kicker: 'Wind', title: `${rounded} mph · ${name}`,
      label: `Wind ${rounded} miles per hour${direction ? ` from the ${name.toLowerCase()}` : ''}` };
  }

  function airQuality(weather) {
    const aqi = weather.air_quality?.us_aqi;
    if (!Number.isFinite(aqi)) return null;
    const category = aqiCategory(aqi);
    // Meteocons' alert-level colors follow the EPA AQI bands.
    const icon = aqi > 300 ? 'code-black' : aqi > 200 ? 'code-purple' : aqi > 150 ? 'code-red'
      : aqi > 100 ? 'code-orange' : aqi > 50 ? 'code-yellow' : 'code-green';
    return { kind: 'air', icon, kicker: 'Air quality', title: `AQI ${aqi} · ${category}`,
      severity: aqi > 150 ? 'Severe' : aqi > 100 ? 'Moderate' : undefined, label: `Air quality index ${aqi}, ${category}` };
  }

  function localDate(time, timeZone) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(time)); } catch { return ''; }
  }

  function moonItem(now, place, moon, timeZone, showRise) {
    const phase = moon.info(new Date(now));
    let sub = '';
    if (showRise && Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude)) {
      if (moon.altitude(new Date(now), place.latitude, place.longitude) > 0) sub = 'Up now';
      else {
        const rise = moon.nextRise(new Date(now), place.latitude, place.longitude, 30);
        const tomorrow = rise && localDate(rise, timeZone) !== localDate(now, timeZone);
        if (rise) sub = `Rises ${tomorrow ? 'tomorrow ' : ''}${clock(rise, timeZone)}`;
      }
    }
    return { kind: 'moon', icon: `moon-${phase.key}`, kicker: 'Moon', title: `${phase.name} · ${phase.illumination}%`, sub,
      label: `Moon: ${phase.name}, ${phase.illumination}% illuminated${sub ? `, ${sub.toLowerCase()}` : ''}` };
  }

  function warning(item) {
    if (item.icon.startsWith('uv-index')) {
      return { ...item, kicker: 'UV index', title: `${item.title.replace('UV index ', '')} · ${item.detail}`, sub: '' };
    }
    return { ...item, kicker: 'Alert · NWS', sub: item.detail };
  }

  // Ticker order: active warnings, air quality, the sky event ahead of us, wind, moon phase.
  function tickerItems(now, weather, place, moon, timeZone, weatherVisual, seed = '') {
    // Air quality has its own always-on item, so its threshold alert is not repeated.
    const warnings = alerts(now, weather, timeZone).filter((item) => item.source !== 'aqi').map(warning);
    const sky = nextSkyEvent(now, weather, place, moon);
    const tomorrow = sky && localDate(sky.time, timeZone) !== localDate(now, timeZone);
    const event = sky && { kind: sky.kind, icon: sky.icon, kicker: sky.kind === 'moonrise' ? 'Moon' : 'Sun',
      title: `${sky.title} ${tomorrow ? 'tomorrow ' : ''}${clock(sky.time, timeZone)}`, sub: sky.detail, label: sky.label };
    // The moon item names its next rise unless the sky item is already that moonrise.
    return [...warnings, airQuality(weather), event, wind(weather, weatherVisual, seed),
      moonItem(now, place, moon, timeZone, sky?.kind !== 'moonrise')].filter(Boolean);
  }

  function key(item) {
    return `${item.kind}|${item.icon}|${item.title}`;
  }

  const api = { UV_THRESHOLD, AQI_THRESHOLD, ROTATE_MS, localTime, duration, nextSkyEvent,
    alertIcon, alerts, wind, airQuality, tickerItems, key };
  if (typeof module !== 'undefined') module.exports = api;
  else root.WeatherSignals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
