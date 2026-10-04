const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateQuick, ENGINE_VERSION } = require('../miniprogram/utils/quick-engine')

const baseProfile = {
  schemaVersion: 1,
  ageBand: '30_34',
  incomeBand: '8_12k',
  workType: 'stable_employed',
  nearTermSignal: 'no_confirmed_change',
  goal: 'save'
}

test('calculates ordered ten-year scenarios for a complete profile', () => {
  const result = calculateQuick(baseProfile)
  assert.equal(result.engineVersion, ENGINE_VERSION)
  assert.equal(result.trajectory.id, 'steady_builder')
  assert.ok(result.tenYearIncome.bear.low <= result.tenYearIncome.base.low)
  assert.ok(result.tenYearIncome.bear.high <= result.tenYearIncome.base.high)
  assert.equal(result.tenYearIncome.confirmed, undefined)
  assert.match(result.displayIncome.base, /万/)
})

test('does not emit any money result when income is undisclosed', () => {
  const result = calculateQuick({ ...baseProfile, incomeBand: 'undisclosed', workType: 'project', nearTermSignal: 'unclear' })
  assert.equal(result.tenYearIncome, undefined)
  assert.equal(result.displayIncome, undefined)
  assert.equal(result.trajectory.id, 'variable_operator')
})

test('uses neutral rebuilding language for transition profiles', () => {
  const result = calculateQuick({ ...baseProfile, workType: 'transition', nearTermSignal: 'pressure', goal: 'career_change' })
  assert.equal(result.trajectory.id, 'rebuilding')
  assert.equal(result.actions[0].id, 'test-direction')
  assert.ok(result.tenYearIncome.bear.low >= 0)
})

test('rejects incomplete profiles instead of inventing an answer', () => {
  assert.throws(() => calculateQuick({ ageBand: '25_29' }), /请完成/)
})

test('keeps every disclosed-income work and short-term-signal combination ordered', () => {
  const workTypes = ['stable_employed', 'employed_variable', 'project', 'business', 'transition']
  const signals = ['confirmed_up', 'no_confirmed_change', 'pressure', 'unclear']
  for (const workType of workTypes) {
    for (const nearTermSignal of signals) {
      const result = calculateQuick({ ...baseProfile, workType, nearTermSignal })
      const { bear, base } = result.tenYearIncome
      assert.ok(bear.low >= 0 && bear.high >= bear.low, `${workType}/${nearTermSignal} bear range`)
      assert.ok(base.low >= bear.low && base.high >= bear.high, `${workType}/${nearTermSignal} base ordering`)
    }
  }
})

test('only includes a higher income path when an upturn is already confirmed', () => {
  const result = calculateQuick({ ...baseProfile, nearTermSignal: 'confirmed_up' })
  assert.ok(result.tenYearIncome.confirmed.low > result.tenYearIncome.base.low)
  assert.ok(result.tenYearIncome.confirmed.high > result.tenYearIncome.base.high)
})

test('uses a flat real-income baseline when no change is confirmed', () => {
  const result = calculateQuick(baseProfile)
  // 8k–12k monthly income held at today’s purchasing power for 120 months.
  assert.deepEqual(result.tenYearIncome.base, { low: 960000, high: 1440000 })
})
