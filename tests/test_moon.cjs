const test = require('node:test');
const assert = require('node:assert/strict');
const { info } = require('../public/moon.js');

test('primary phases align with published 2026 phase times', () => {
  const cases = [
    ['2026-10-10T15:50:00Z', 'New moon', 0],
    ['2026-10-18T16:12:00Z', 'First quarter', 50],
    ['2026-10-26T04:12:00Z', 'Full moon', 100],
    ['2026-11-01T20:28:00Z', 'Last quarter', 50],
  ];
  for (const [date, name, illumination] of cases) {
    const phase = info(new Date(date));
    assert.equal(phase.name, name);
    assert.ok(Math.abs(phase.illumination - illumination) <= 2, `${date}: ${phase.illumination}%`);
  }
});

test('the phase between new moon and first quarter is waxing crescent', () => {
  const phase = info(new Date('2026-10-13T23:26:00Z'));
  assert.equal(phase.name, 'Waxing crescent');
  assert.ok(phase.illumination >= 10 && phase.illumination <= 15);
});
