const test = require('node:test');
const assert = require('node:assert/strict');
const { forecastFrames, project, tileLayout, viewportPoint } = require('../public/radar.js');

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

test('forecast frames begin at the next UTC hour and cover six hours', () => {
  const frames = forecastFrames(Date.parse('2026-10-14T20:37:00Z'));
  assert.equal(frames.length, 6);
  assert.deepEqual(frames[0], { time: 1792011600, stamp: '2026101421', leadHours: 1 });
  assert.deepEqual(frames[5], { time: 1792029600, stamp: '2026101502', leadHours: 6 });
});
