const test = require('node:test');
const assert = require('node:assert/strict');
const { project, tileLayout, viewportPoint } = require('../public/radar.js');

test('map projection keeps the selected location at viewport center', () => {
  const point = viewportPoint(39.9526, -75.1652, 39.9526, -75.1652, 1920, 1080, 7, 256);
  assert.deepEqual(point, { x: 960, y: 540 });
});

test('tile layout covers only the visible viewport', () => {
  const tiles = tileLayout(39.9526, -75.1652, 1920, 1080, 7, 256);
  assert.ok(tiles.length >= 32 && tiles.length <= 54);
  assert.ok(tiles.every((tile) => tile.x >= 0 && tile.x < 128 && tile.y >= 0 && tile.y < 128));
  const center = project(39.9526, -75.1652, 7, 256);
  assert.ok(center.x > 0 && center.y > 0);
});
