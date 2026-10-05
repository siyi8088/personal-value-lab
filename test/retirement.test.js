const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateStatutoryRetirement } = require('../miniprogram/utils/retirement')

test('calculates male progressive retirement delay correctly according to 2025 policy', () => {
  // 1965年1月出生男职工：满60岁是2025年1月，延1个月到2025年2月退休
  const m1965Jan = calculateStatutoryRetirement(1965, 1, 'male')
  assert.equal(m1965Jan.delayMonths, 1)
  assert.equal(m1965Jan.retirementYear, 2025)
  assert.equal(m1965Jan.retirementMonth, 2)
  assert.equal(m1965Jan.ageText, '60 岁 1 个月')

  // 1965年4月：满60岁是2025年4月，仍在第1季度区间，延1个月
  const m1965Apr = calculateStatutoryRetirement(1965, 4, 'male')
  assert.equal(m1965Apr.delayMonths, 1)
  assert.equal(m1965Apr.retirementYear, 2025)
  assert.equal(m1965Apr.retirementMonth, 5)

  // 1965年5月：满60岁是2025年5月，延2个月到2025年7月
  const m1965May = calculateStatutoryRetirement(1965, 5, 'male')
  assert.equal(m1965May.delayMonths, 2)
  assert.equal(m1965May.retirementYear, 2025)
  assert.equal(m1965May.retirementMonth, 7)

  // 1980年及以后的年轻男性：全部封顶延迟36个月，63岁退休
  const m1980 = calculateStatutoryRetirement(1980, 6, 'male')
  assert.equal(m1980.delayMonths, 36)
  assert.equal(m1980.statutoryAgeRounded, 63)
  assert.equal(m1980.ageText, '63 岁')
  assert.equal(m1980.retirementYear, 2043)
})

test('calculates female progressive retirement delay correctly for 55 and 50 baselines', () => {
  // 女性女干部/技术/灵活就业（原55岁），1985年出生全部封顶到58岁
  const f1985 = calculateStatutoryRetirement(1985, 6, 'female', 'cadre_or_flexible')
  assert.equal(f1985.delayMonths, 36)
  assert.equal(f1985.statutoryAgeRounded, 58)
  assert.equal(f1985.ageText, '58 岁')

  // 女性工人（原50岁），1985年出生全部封顶到55岁
  const fWorker1985 = calculateStatutoryRetirement(1985, 6, 'female', 'worker')
  assert.equal(fWorker1985.delayMonths, 60)
  assert.equal(fWorker1985.statutoryAgeRounded, 55)
  assert.equal(fWorker1985.ageText, '55 岁')

  // 2025年之前已达退休年龄的，保持原退休年龄
  const pastRetired = calculateStatutoryRetirement(1960, 1, 'male')
  assert.equal(pastRetired.delayMonths, 0)
  assert.equal(pastRetired.statutoryAgeRounded, 60)
  assert.equal(pastRetired.ageText, '60 岁')
})
