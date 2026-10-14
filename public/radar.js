/* Web Mercator helpers shared by the regional radar screen and its tests. */
(function (root) {
  'use strict';

  function project(latitude, longitude, zoom, tileSize) {
    const size = tileSize * (2 ** zoom);
    const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
    const sin = Math.sin(lat * Math.PI / 180);
    return {
      x: (longitude + 180) / 360 * size,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
    };
  }

  function tileLayout(latitude, longitude, width, height, zoom, tileSize) {
    const center = project(latitude, longitude, zoom, tileSize);
    const left = center.x - width / 2;
    const top = center.y - height / 2;
    const firstX = Math.floor(left / tileSize);
    const lastX = Math.floor((left + width - 1) / tileSize);
    const firstY = Math.max(0, Math.floor(top / tileSize));
    const maximum = (2 ** zoom) - 1;
    const lastY = Math.min(maximum, Math.floor((top + height - 1) / tileSize));
    const tiles = [];
    for (let y = firstY; y <= lastY; y += 1) {
      for (let x = firstX; x <= lastX; x += 1) {
        tiles.push({
          x: ((x % (maximum + 1)) + maximum + 1) % (maximum + 1), y,
          left: x * tileSize - left, top: y * tileSize - top,
        });
      }
    }
    return tiles;
  }

  function viewportPoint(latitude, longitude, centerLatitude, centerLongitude, width, height, zoom, tileSize) {
    const point = project(latitude, longitude, zoom, tileSize);
    const center = project(centerLatitude, centerLongitude, zoom, tileSize);
    return { x: width / 2 + point.x - center.x, y: height / 2 + point.y - center.y };
  }

  const api = { project, tileLayout, viewportPoint };
  if (typeof module !== 'undefined') module.exports = api;
  else root.RadarMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
