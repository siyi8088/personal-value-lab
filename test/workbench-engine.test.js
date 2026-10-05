const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createDefaultWorkbenchProfile,
  validateDoubleCounting,
  calculateForwardDcf,
  calculateSensitivityMatrix,
  calculateReverseDcf
} = require('../miniprogram/utils/workbench-engine')

test('creates default workbench profile with clean initial state', () => {
  const profile = createDefaultWorkbenchProfile()
  assert.equal(profile.currentAge, 32)
  assert.equal(profile.incomeStreams.length, 2)
  assert.equal(profile.basis, 'income_capacity')
})

test('strictly forbids double counting between NAV and cash flow DCF', () => {
  const profile = createDefaultWorkbenchProfile({
    incomeStreams: [
      { id: 'rental_stream', name: '房租现金流', kind: 'rental', annualAmount: 60000, startAge: 32, endAge: 63, maintenanceCost: 5000 }
    ],
    assets: [
      { id: 'rental_property', name: '出租房产', conservativeValue: 2000000, valuationMethod: 'nav', linkedIncomeStreamId: 'rental_stream' }
    ]
  })

  // Since asset chooses NAV, having the linked rental stream in DCF is an illegal double counting
  const check = validateDoubleCounting(profile)
  assert.equal(check.isValid, false)
  assert.match(check.errors[0], /双重计价/)

  assert.throws(() => calculateForwardDcf(profile), /双重计价/)
})

test('correctly deducts living and mortgage expenses when switching to disposable cash flow basis', () => {
  const baseProfile = createDefaultWorkbenchProfile()
  const grossResult = calculateForwardDcf({ ...baseProfile, basis: 'income_capacity' })
  const netResult = calculateForwardDcf({ ...baseProfile, basis: 'disposable_cashflow' })

  // Net PFCF must be strictly lower than Gross PFCF due to expenses and mortgage
  assert.ok(netResult.totalPcsv < grossResult.totalPcsv)
  assert.ok(netResult.workingPv < grossResult.workingPv)
  assert.equal(grossResult.basis, 'income_capacity')
  assert.equal(netResult.basis, 'disposable_cashflow')
})

test('generates r × g sensitivity matrix and prevents r <= g calculation', () => {
  const profile = createDefaultWorkbenchProfile({
    incomeStreams: [
      { id: 's1', name: '自营分红', kind: 'business', annualAmount: 100000, startAge: 32, endAge: 63, maintenanceCost: 10000, supportsTerminalValue: true }
    ]
  })
  const sens = calculateSensitivityMatrix(profile, [0.03, 0.04], [0.01, 0.03])
  assert.equal(sens.matrix.length, 2)

  // r = 0.03, g = 0.03 is invalid because r <= g
  const row0 = sens.matrix[0]
  assert.equal(row0.r, 0.03)
  assert.equal(row0.values[0].g, 0.01)
  assert.equal(row0.values[0].invalid, false)
  assert.equal(row0.values[1].g, 0.03)
  assert.equal(row0.values[1].invalid, true)
})

test('solves Reverse DCF 3 equi-value paths and closes the value gap', () => {
  const profile = createDefaultWorkbenchProfile()
  const forward = calculateForwardDcf(profile)
  const target = forward.totalPcsv + 1000000 // 目标增加 100 万现值

  const reverse = calculateReverseDcf(profile, target)
  assert.equal(reverse.gap, 1000000)

  // Check 3 paths are computed
  assert.ok(reverse.paths.laborPath.annualAmount > 0)
  assert.ok(reverse.paths.enginePath.annualAmount > 0)
  assert.ok(reverse.paths.savingsPath.monthlyAmount > 0)

  // Mathematically verify Path 1: adding the extra labor PFCF into working years recovers the target value!
  const r = profile.discountRate
  const workYears = profile.expectedRetirementAge - profile.currentAge
  let recoveredPv = 0
  for (let t = 1; t <= workYears; t += 1) {
    recoveredPv += reverse.paths.laborPath.annualAmount / Math.pow(1 + r, t)
  }
  assert.ok(Math.abs(recoveredPv - reverse.gap) < 50, 'Incremental labor PV matches Gap')

  // Check Severity evaluation
  assert.ok(['low', 'medium', 'high', 'achieved'].includes(reverse.severity.level))
  assert.ok(reverse.severity.badge)

  // Test fully checked reality checklist
  profile.targetGoal.realityCheck = {
    hasCustomerBase: true,
    hasTimeCapital: true,
    toleratesZeroGrowth: true,
    hasDownsideBuffer: true
  }
  const reverseChecked = calculateReverseDcf(profile, 3000000)
  assert.ok(reverseChecked.severity.reasons.some(r => r.includes('4项现实条件均已完成检验')))
})

test('inherits questionnaire draft data into workbench profile', () => {
  const draft = {
    currentAge: 35,
    statutoryAge: 63,
    expectedRetirementAge: 60,
    incomeBand: '20_35k',
    workType: 'project',
    careerRisk: 'unemployment_risk',
    pensionTier: 'affluent',
    hasRecurringEngine: 'rental',
    engineAnnualNetCashFlow: 50000
  }

  const profile = createDefaultWorkbenchProfile({}, draft)
  assert.equal(profile.currentAge, 35)
  assert.equal(profile.expectedRetirementAge, 60)

  // Primary job: project work -> 'side_job', 330k/yr, 5-year cliff (endAge = 40)
  const primary = profile.incomeStreams.find(s => s.id === 'stream_primary_job')
  assert.ok(primary)
  assert.equal(primary.kind, 'side_job')
  assert.equal(primary.annualAmount, 330000)
  assert.equal(primary.endAge, 40) // 35 + 5 = 40 cliff!

  // Social pension: affluent -> 96k/yr
  const pension = profile.incomeStreams.find(s => s.id === 'stream_social_pension')
  assert.ok(pension)
  assert.equal(pension.annualAmount, 96000)
  assert.equal(pension.startAge, 60)

  // Recurring engine: rental -> 50k/yr, supportsTerminalValue = true
  const engine = profile.incomeStreams.find(s => s.id === 'stream_recurring_engine')
  assert.ok(engine)
  assert.equal(engine.kind, 'rental')
  assert.equal(engine.annualAmount, 50000)
  assert.equal(engine.supportsTerminalValue, true)
})

test('dynamically centers r x g sensitivity matrix around profile values', () => {
  const profile = createDefaultWorkbenchProfile({
    discountRate: 0.04, // 4.0%
    terminalGrowthRate: 0.01 // 1.0%
  })

  const sens = calculateSensitivityMatrix(profile)
  assert.equal(sens.matrix.length, 5) // 5 rows
  assert.equal(sens.matrix[0].values.length, 5) // 5 cols

  // r should be [3.0%, 3.5%, 4.0%, 4.5%, 5.0%]
  assert.deepEqual(sens.matrix.map(row => row.rLabel), ['3.0%', '3.5%', '4.0%', '4.5%', '5.0%'])

  // g should be [0.5%, 0.75%, 1.0%, 1.25%, 1.5%]
  assert.deepEqual(sens.gLabels, ['0.5%', '0.75%', '1.0%', '1.25%', '1.5%'])

  // Check center point
  const centerRow = sens.matrix[2]
  assert.equal(centerRow.rLabel, '4.0%')
  const centerCell = centerRow.values[2]
  assert.equal(centerCell.gLabel, '1.0%')
  assert.equal(centerCell.isCenter, true)
  assert.ok(centerCell.heatLevel >= 1 && centerCell.heatLevel <= 5)
})
