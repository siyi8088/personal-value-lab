const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateQuick, ENGINE_VERSION } = require('../miniprogram/utils/quick-engine')

const baseProfile = {
  schemaVersion: 2,
  gender: 'male',
  birthYear: 1994, // 32 years old in 2026, statutory retirement age 63
  incomeBand: '8_12k',
  workType: 'stable_employed',
  careerRisk: 'steady',
  pensionTier: 'average', // 3000 / mo
  hasRecurringEngine: 'none',
  goal: 'save'
}

test('calculates DCF structure and ratios for a complete profile', () => {
  const result = calculateQuick(baseProfile)
  assert.equal(result.engineVersion, ENGINE_VERSION)
  assert.equal(result.statutoryRetirementAge, 63)
  assert.ok(result.dcf.moneyAvailable)

  // Working period PV, pension PV, and total PV
  assert.ok(result.dcf.workingPv.mid > 0)
  assert.ok(result.dcf.postRetirePv.mid > 0)
  assert.equal(result.dcf.strictTvPv.mid, 0) // No recurring engine -> Strict TV = 0

  // Ratios sum to 100
  const { workingRatio, postRetirementRatio, strictTvRatio } = result.dcf.ratios
  assert.equal(workingRatio + postRetirementRatio + strictTvRatio, 100)
  assert.ok(postRetirementRatio > 0 && postRetirementRatio < 50)
  assert.equal(strictTvRatio, 0)

  // Persona
  assert.ok(result.persona)
  assert.equal(result.persona.type, 'labor_dominant')
  assert.equal(result.persona.dominantPillar, 'working')
  assert.ok(result.persona.badge)
  assert.ok(result.persona.punchline)
})

test('correctly cuts off labor cash flow at 5 years when unemployment_risk is selected', () => {
  const normalResult = calculateQuick({ ...baseProfile, careerRisk: 'steady' })
  const cliffResult = calculateQuick({ ...baseProfile, careerRisk: 'unemployment_risk' })

  // Cliff detection
  assert.equal(cliffResult.dcf.cliff.hasCliff, true)
  assert.equal(cliffResult.dcf.cliff.activeWorkYears, 5)
  assert.ok(cliffResult.dcf.cliff.cliffYears > 20) // e.g. from age 37 to 63

  // Working PV must be significantly smaller than normal lifetime working PV
  assert.ok(cliffResult.dcf.workingPv.mid < normalResult.dcf.workingPv.mid)

  // Post retirement cash flow ratio becomes much higher relatively
  assert.ok(cliffResult.dcf.ratios.postRetirementRatio > normalResult.dcf.ratios.postRetirementRatio)
})

test('calculates strict Gordon TV when qualified recurring engine is present', () => {
  const withEngineResult = calculateQuick({
    ...baseProfile,
    hasRecurringEngine: 'business',
    engineMaintainedAfterRetire: true,
    engineAnnualNetCashFlow: 50000
  })

  assert.ok(withEngineResult.dcf.strictTvPv.mid > 0)
  assert.ok(withEngineResult.dcf.ratios.strictTvRatio > 0)
  assert.match(withEngineResult.displayDcf.strictTvPv, /万/)
})

test('does not emit any money result when income is undisclosed', () => {
  const result = calculateQuick({
    ...baseProfile,
    incomeBand: 'undisclosed',
    workType: 'project',
    careerRisk: 'steady'
  })
  assert.equal(result.dcf.moneyAvailable, false)
  assert.equal(result.tenYearIncome, undefined)
  assert.equal(result.displayIncome, undefined)
  assert.equal(result.displayDcf, undefined)
})

test('rejects incomplete profiles instead of inventing an answer', () => {
  assert.throws(() => calculateQuick({ ageBand: '25_29' }), /请完成/)
})

test('supports legacy profile format with ageBand and nearTermSignal', () => {
  const legacyProfile = {
    ageBand: '30_34',
    incomeBand: '8_12k',
    workType: 'stable_employed',
    nearTermSignal: 'no_confirmed_change',
    goal: 'save'
  }
  const result = calculateQuick(legacyProfile)
  assert.ok(result.dcf.moneyAvailable)
  assert.ok(result.dcf.workingPv.mid > 0)
  assert.equal(result.careerRisk.id, 'steady')
})
