(function (root) {
  'use strict';

  // Low-precision solar/lunar coordinates adapted for a display-scale phase readout.

  const RAD = Math.PI / 180;
  const DAY_MS = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const EARTH_TILT = RAD * 23.4397;

  function rightAscension(longitude, latitude) {
    return Math.atan2(
      Math.sin(longitude) * Math.cos(EARTH_TILT) - Math.tan(latitude) * Math.sin(EARTH_TILT),
      Math.cos(longitude),
    );
  }

  function declination(longitude, latitude) {
    return Math.asin(
      Math.sin(latitude) * Math.cos(EARTH_TILT)
      + Math.cos(latitude) * Math.sin(EARTH_TILT) * Math.sin(longitude),
    );
  }

  function toDays(date) {
    return date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
  }

  function sunCoordinates(days) {
    const anomaly = RAD * (357.5291 + 0.98560028 * days);
    const longitude = anomaly + RAD * (
      1.9148 * Math.sin(anomaly)
      + 0.02 * Math.sin(2 * anomaly)
      + 0.0003 * Math.sin(3 * anomaly)
      + 102.9372
    ) + Math.PI;
    return { ra: rightAscension(longitude, 0), dec: declination(longitude, 0) };
  }

  function moonCoordinates(days) {
    const meanLongitude = RAD * (218.316 + 13.176396 * days);
    const meanAnomaly = RAD * (134.963 + 13.064993 * days);
    const meanDistance = RAD * (93.272 + 13.229350 * days);
    const longitude = meanLongitude + RAD * 6.289 * Math.sin(meanAnomaly);
    const latitude = RAD * 5.128 * Math.sin(meanDistance);
    return {
      ra: rightAscension(longitude, latitude),
      dec: declination(longitude, latitude),
      distance: 385001 - 20905 * Math.cos(meanAnomaly),
    };
  }

  function position(date) {
    const days = toDays(date);
    const sun = sunCoordinates(days);
    const moon = moonCoordinates(days);
    const sunDistance = 149598000;
    const cosElongation = (
      Math.sin(sun.dec) * Math.sin(moon.dec)
      + Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra)
    );
    const elongation = Math.acos(Math.max(-1, Math.min(1, cosElongation)));
    const incidence = Math.atan2(
      sunDistance * Math.sin(elongation),
      moon.distance - sunDistance * Math.cos(elongation),
    );
    const angle = Math.atan2(
      Math.cos(sun.dec) * Math.sin(sun.ra - moon.ra),
      Math.sin(sun.dec) * Math.cos(moon.dec)
      - Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(sun.ra - moon.ra),
    );
    return {
      fraction: (1 + Math.cos(incidence)) / 2,
      phase: 0.5 + 0.5 * incidence * (angle < 0 ? -1 : 1) / Math.PI,
    };
  }

  function altitude(date, latitude, longitude) {
    const days = toDays(date);
    const moon = moonCoordinates(days);
    const phi = RAD * latitude;
    const hourAngle = RAD * (280.16 + 360.9856235 * days) + RAD * longitude - moon.ra;
    const height = Math.asin(Math.sin(phi) * Math.sin(moon.dec) + Math.cos(phi) * Math.cos(moon.dec) * Math.cos(hourAngle));
    // Atmospheric refraction, as used by the standard low-precision rise/set calculation.
    return height + RAD * 0.017 / Math.tan(height + RAD * 10.26 / (height + RAD * 5.10));
  }

  // Next time the moon's upper limb clears the horizon, scanning forward up to `hours`.
  function nextRise(date, latitude, longitude, hours = 36) {
    const horizon = RAD * 0.133;
    const step = 10 * 60000;
    let previousTime = date.valueOf();
    let previous = altitude(date, latitude, longitude) - horizon;
    for (let time = previousTime + step; time <= previousTime + hours * 3600000 + step; time += step) {
      const current = altitude(new Date(time), latitude, longitude) - horizon;
      if (previous < 0 && current >= 0) {
        return new Date(time - step + step * (-previous / (current - previous)));
      }
      previous = current;
    }
    return null;
  }

  function info(date = new Date()) {
    const { fraction, phase } = position(date);
    const phases = [
      ['new', 'New moon'],
      ['waxing-crescent', 'Waxing crescent'],
      ['first-quarter', 'First quarter'],
      ['waxing-gibbous', 'Waxing gibbous'],
      ['full', 'Full moon'],
      ['waning-gibbous', 'Waning gibbous'],
      ['last-quarter', 'Last quarter'],
      ['waning-crescent', 'Waning crescent'],
    ];
    const index = Math.floor((phase * 8 + 0.5) % 8);
    return {
      key: phases[index][0],
      name: phases[index][1],
      illumination: Math.round(fraction * 100),
      phase,
    };
  }

  const api = { info, position, altitude, nextRise };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MoonPhase = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
