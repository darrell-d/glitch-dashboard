(function (root) {
  'use strict';

  // The variable weather slot: active alerts rotate; otherwise show the next sky event.
  const SUNRISE_LEAD = '04:30';
  const UV_THRESHOLD = 6;
  const AQI_THRESHOLD = 101;
  const ROTATE_MS = 7000;

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

  function moonPhase(now, moon) {
    const phase = moon.info(new Date(now));
    return { kind: 'moon', icon: `moon-${phase.key}`, title: phase.name,
      detail: `${phase.illumination}% illuminated`, label: `Moon: ${phase.name}, ${phase.illumination}% illuminated` };
  }

  function astronomy(now, weather, place, moon) {
    const daily = weather.daily || {};
    const offset = weather.utc_offset_seconds;
    const days = (daily.time || []).map((day, i) => ({
      dawn: localTime(`${day}T${SUNRISE_LEAD}`, offset),
      sunrise: localTime(daily.sunrise?.[i], offset),
      sunset: localTime(daily.sunset?.[i], offset),
    })).filter((day) => day.dawn !== null && day.sunrise !== null && day.sunset !== null);
    const sunrise = days.find((day) => day.sunrise > now);
    const sunset = days.find((day) => day.sunset > now);
    if (!sunrise || !sunset) return moonPhase(now, moon);
    const event = (kind, time, title) => ({ kind, icon: kind, title, time, detail: duration(time - now),
      label: `${title} ${duration(time - now)}` });
    // The sun is up: the next sunset arrives before the next sunrise.
    if (sunset.sunset < sunrise.sunrise) return event('sunset', sunset.sunset, 'Sunset');
    if (now >= sunrise.dawn) return event('sunrise', sunrise.sunrise, 'Sunrise');
    // Night: announce tonight's moonrise until it passes, then the phase.
    const rise = Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude)
      ? moon.nextRise(new Date(now), place.latitude, place.longitude, 24) : null;
    if (rise && rise.valueOf() < sunrise.dawn) return event('moonrise', rise.valueOf(), 'Moonrise');
    return moonPhase(now, moon);
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
      list.push({ kind: 'alert', icon: 'smoke', title: `Air quality ${aqi}`, detail: aqiCategory(aqi),
        severity: aqi > 150 ? 'Severe' : 'Moderate', label: `Air quality index ${aqi}, ${aqiCategory(aqi)}` });
    }
    const level = Math.round(weather.current?.uv_index);
    if (level >= UV_THRESHOLD) {
      list.push({ kind: 'alert', icon: level > 11 ? 'uv-index-11-plus' : `uv-index-${level}`, title: `UV index ${level}`,
        detail: uvCategory(level), severity: level >= 8 ? 'Severe' : 'Moderate', label: `UV index ${level}, ${uvCategory(level)}` });
    }
    return list;
  }

  // Everything the slot should cycle through right now; always at least one item.
  function items(now, weather, place, moon, timeZone) {
    const active = alerts(now, weather, timeZone);
    return active.length ? active : [astronomy(now, weather, place, moon)];
  }

  function key(item) {
    return `${item.icon}|${item.title}|${item.detail}`;
  }

  const api = { SUNRISE_LEAD, UV_THRESHOLD, AQI_THRESHOLD, ROTATE_MS, localTime, duration, astronomy,
    alertIcon, alerts, items, key };
  if (typeof module !== 'undefined') module.exports = api;
  else root.WeatherSignals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
