const test = require('node:test');
const assert = require('node:assert/strict');
const { Display, HEIGHT, WIDTH, World } = require('../public/lawnmower.js');

test('world grows grass, moves the mower, and cuts its current patch', () => {
  const world = new World(() => 0);
  const startY = world.y;
  world.tick();
  assert.equal(world.ticks, 1);
  assert.equal(world.y, startY - 1);
  assert.equal(world.score, 16);
  assert.equal(world.grass[world.x][world.y], 0);
  assert.equal(world.grass[0][0], 1);
});

test('mower remains inside the lawn over a long run', () => {
  let state = 3;
  const world = new World(() => { state = (state * 16807) % 2147483647; return state / 2147483647; });
  for (let i = 0; i < 5000; i += 1) world.tick();
  assert.ok(world.x >= 0 && world.x <= WIDTH - 4);
  assert.ok(world.y >= 0 && world.y <= HEIGHT - 4);
});

test('display keeps the same world ticking while hidden', () => {
  let timer;
  let paints = 0;
  const context = {
    fillRect() { paints += 1; }, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, fillText() {},
    set fillStyle(_) {}, set strokeStyle(_) {}, set lineWidth(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {},
  };
  const canvas = { clientWidth: 100, clientHeight: 75, width: 0, height: 0, getContext: () => context };
  const display = new Display(canvas, { random: () => 1, setTimer: (callback) => { timer = callback; return 1; } });
  display.setVisible(true);
  const visiblePaints = paints;
  timer();
  assert.equal(display.world.ticks, 1);
  assert.ok(paints > visiblePaints);
  display.setVisible(false);
  const hiddenPaints = paints;
  timer();
  assert.equal(display.world.ticks, 2);
  assert.equal(paints, hiddenPaints);
  display.setVisible(true);
  assert.equal(display.world.ticks, 2);
  assert.ok(paints > hiddenPaints);
});
