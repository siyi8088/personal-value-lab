/**
 * 中国法定退休年龄测算器（依据 2025 年 1 月 1 日施行的《关于实施渐进式延迟法定退休年龄的决定》）
 */

const RETIREMENT_RULES = {
  male: {
    originalAge: 60,
    targetAge: 63,
    maxDelayMonths: 36,
    delayIntervalMonths: 4 // 每 4 个月延迟 1 个月
  },
  female_55: {
    originalAge: 55,
    targetAge: 58,
    maxDelayMonths: 36,
    delayIntervalMonths: 4 // 每 4 个月延迟 1 个月 (女干部/专业技术/灵活就业)
  },
  female_50: {
    originalAge: 50,
    targetAge: 55,
    maxDelayMonths: 60,
    delayIntervalMonths: 2 // 每 2 个月延迟 1 个月 (女工人)
  }
}

/**
 * 测算法定退休年龄及退休时间
 * @param {number} birthYear 出生年份 (如 1990)
 * @param {number} [birthMonth=6] 出生月份 (1-12，默认年中 6 月)
 * @param {'male'|'female'} [gender='male'] 性别
 * @param {'cadre_or_flexible'|'worker'} [femaleType='cadre_or_flexible'] 女性人员类型（默认女干部/技术/灵活就业 55 起步）
 */
function calculateStatutoryRetirement(birthYear, birthMonth = 6, gender = 'male', femaleType = 'cadre_or_flexible') {
  const ruleKey = gender === 'female'
    ? (femaleType === 'worker' ? 'female_50' : 'female_55')
    : 'male'
  const rule = RETIREMENT_RULES[ruleKey]

  const origRetireYear = birthYear + rule.originalAge
  const origRetireMonth = birthMonth

  // 2025 年 1 月 1 日之前达到原法定退休年龄的，不参与延迟
  if (origRetireYear < 2025) {
    return {
      ruleKey,
      originalAge: rule.originalAge,
      statutoryAge: rule.originalAge,
      statutoryAgeRounded: rule.originalAge,
      delayMonths: 0,
      retirementYear: origRetireYear,
      retirementMonth: origRetireMonth,
      ageText: `${rule.originalAge} 岁`,
      delayText: '未延迟'
    }
  }

  // 距离 2025 年 1 月的累计月数 (2025年1月 = 1)
  const elapsedMonths = (origRetireYear - 2025) * 12 + origRetireMonth

  // 延迟月数
  const rawDelay = Math.ceil(elapsedMonths / rule.delayIntervalMonths)
  const delayMonths = Math.min(rule.maxDelayMonths, Math.max(0, rawDelay))

  const totalMonths = (origRetireYear * 12 + (origRetireMonth - 1)) + delayMonths
  const retirementYear = Math.floor(totalMonths / 12)
  const retirementMonth = (totalMonths % 12) + 1

  const delayYearsPart = Math.floor(delayMonths / 12)
  const delayMonthsPart = delayMonths % 12
  const statutoryAge = rule.originalAge + delayMonths / 12

  let ageText = ''
  if (delayMonthsPart === 0) {
    ageText = `${rule.originalAge + delayYearsPart} 岁`
  } else {
    ageText = `${rule.originalAge + delayYearsPart} 岁 ${delayMonthsPart} 个月`
  }

  let delayText = ''
  if (delayMonths === 0) {
    delayText = '未延迟'
  } else if (delayMonthsPart === 0) {
    delayText = `延迟 ${delayYearsPart} 年`
  } else if (delayYearsPart === 0) {
    delayText = `延迟 ${delayMonthsPart} 个月`
  } else {
    delayText = `延迟 ${delayYearsPart} 年 ${delayMonthsPart} 个月`
  }

  return {
    ruleKey,
    originalAge: rule.originalAge,
    statutoryAge: Math.round(statutoryAge * 10) / 10,
    statutoryAgeRounded: Math.round(statutoryAge),
    delayMonths,
    retirementYear,
    retirementMonth,
    ageText,
    delayText
  }
}

module.exports = {
  RETIREMENT_RULES,
  calculateStatutoryRetirement
}
