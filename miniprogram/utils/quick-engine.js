/**
 * Future Income Map calculation engine, version 1.
 *
 * This module deliberately has no wx, network or UI dependency. It uses only
 * coarse self-reported bands and returns a ten-year *earned-income scenario*,
 * never a person's "value", assets, liabilities or a ranking.
 */
const ENGINE_VERSION = 'quick-v1.0.0'

const INCOME_BANDS = {
  under_5k: [2400, 5000],
  '5_8k': [5000, 8000],
  '8_12k': [8000, 12000],
  '12_20k': [12000, 20000],
  '20_35k': [20000, 35000],
  '35_50k': [35000, 50000],
  '50_80k': [50000, 80000],
  '80k_plus': [80000, 120000]
}

const WORK_ASSUMPTIONS = {
  // These values only widen the downside scenario. They never create a
  // default long-term income-growth assumption.
  stable_employed: { downside: 0.06, stability: '较高' },
  employed_variable: { downside: 0.1, stability: '中等' },
  project: { downside: 0.16, stability: '较低' },
  business: { downside: 0.2, stability: '较低' },
  transition: { downside: 0.26, stability: '较低' }
}

const NEAR_TERM_SIGNALS = {
  confirmed_up: [0.06, 0.02],
  no_confirmed_change: [0, 0],
  pressure: [-0.08, -0.02],
  unclear: [0, 0]
}

const ACTIONS = {
  raise: {
    id: 'prove-next-level', title: '证明下一档能力', period: '本周开始',
    firstStep: '写下一个可量化的工作成果，并约一次发展沟通。',
    rationale: '把“希望涨薪”变成能被验证的成果，比只等待机会更可控。'
  },
  career_change: {
    id: 'test-direction', title: '低成本验证新方向', period: '两周内',
    firstStep: '完成一次行业访谈或一个小作品，再决定是否投入课程或辞职。',
    rationale: '转型期最重要的是先获得真实反馈，而不是一次性押注。'
  },
  stability: {
    id: 'map-low-month', title: '先认识你的低谷月', period: '本周开始',
    firstStep: '记录过去 6 个月的到手收入，圈出最低的一个月。',
    rationale: '知道低谷收入，才知道自己需要怎样的收入缓冲。'
  },
  learn: {
    id: 'validate-skill', title: '验证一项关键技能', period: '两周内',
    firstStep: '用两周完成一个真实任务或作品，验证它是否带来新的机会。',
    rationale: '先验证技能和机会的连接，再投入更高的学习成本。'
  },
  save: {
    id: 'start-buffer', title: '建立一笔小缓冲', period: '下个发薪日',
    firstStep: '设置一笔自动转入独立账户的小额储蓄。',
    rationale: '可见的小缓冲，会让未来的选择更从容。'
  },
  none: {
    id: 'review-income', title: '看清收入的来源', period: '本周开始',
    firstStep: '把最近三个月的收入按固定、浮动和偶发三类写下来。',
    rationale: '先看清哪部分收入可持续，才能判断下一步要改善什么。'
  }
}

function assertProfile(profile) {
  if (!profile || !profile.ageBand || !profile.incomeBand || !profile.workType || !profile.nearTermSignal) {
    throw new Error('请完成所有必答问题。')
  }
  if (profile.incomeBand !== 'undisclosed' && !INCOME_BANDS[profile.incomeBand]) {
    throw new Error('收入区间无效。')
  }
  if (!WORK_ASSUMPTIONS[profile.workType] || !Object.prototype.hasOwnProperty.call(NEAR_TERM_SIGNALS, profile.nearTermSignal)) {
    throw new Error('工作状态或短期变化信息无效。')
  }
}

function trajectoryFor(profile) {
  if (profile.workType === 'transition') return { id: 'rebuilding', title: '重建调整型', description: '当前先稳住可承受周期，再验证新的收入路径。' }
  if (profile.workType === 'project' || profile.workType === 'business') return { id: 'variable_operator', title: '波动进攻型', description: '收入弹性较大；优先分清高峰收入与可持续收入。' }
  if (profile.nearTermSignal === 'confirmed_up') {
    return { id: 'confirmed_change', title: '短期变化已确认', description: '把已经发生或确定的变化计入前两年，之后仍按保守基线看待。' }
  }
  return { id: 'steady_builder', title: '稳步积累型', description: '你的路径更依赖持续积累；关注下一档能力与缓冲。' }
}

function annualTotal(monthlyRange, assumption, scenario, nearTermSignal) {
  const downsideMultiplier = scenario === 'bear' ? 1 - assumption.downside : 1
  const shortTermRates = NEAR_TERM_SIGNALS[nearTermSignal]
  const totals = monthlyRange.map((monthly, boundary) => {
    let total = 0
    let yearlyIncome = monthly * 12 * downsideMultiplier
    for (let year = 1; year <= 10; year += 1) {
      // Only an already confirmed short-term signal changes years one and two.
      // From year three onward the real-income baseline is deliberately flat.
      if (year <= 2 && shortTermRates[year - 1]) yearlyIncome *= (1 + shortTermRates[year - 1])
      total += yearlyIncome
    }
    return Math.max(0, Math.round(total))
  })
  return { low: Math.min(totals[0], totals[1]), high: Math.max(totals[0], totals[1]) }
}

function formatWan(value) {
  const wan = value / 10000
  if (wan < 10) return `${Math.round(wan)} 万`
  return `${Math.round(wan / 5) * 5} 万`
}

function formatRange(range) {
  return `${formatWan(range.low)} – ${formatWan(range.high)}`
}

function calculateQuick(profile) {
  assertProfile(profile)
  const assumption = WORK_ASSUMPTIONS[profile.workType]
  const trajectory = trajectoryFor(profile)
  const primaryAction = ACTIONS[profile.goal || 'none']
  const commonAction = profile.workType === 'project' || profile.workType === 'business'
    ? ACTIONS.stability
    : ACTIONS.save
  const result = {
    engineVersion: ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    trajectory,
    stability: assumption.stability,
    actions: [primaryAction, commonAction].filter((action, index, list) => list.findIndex((item) => item.id === action.id) === index),
    explanations: [
      '这份地图按今天的购买力推演未来十年的税后职业收入情景。',
      '默认不假设长期收入增长；第 3 年起按收入大致维持的保守基线计算。',
      '只有已经确认的短期变化才会影响前两年；“想涨薪、学习或转行”不会自动提高金额。',
      '它没有计算房子、存款、债务、伴侣收入、投资收益或生活支出。',
      '结果展示有压力时与按当前底盘的收入带，不是对人生或能力的预测。'
    ],
    disclosures: [
      '这是基于少量自报信息的教育性估算，不衡量人的价值。',
      '结果不构成投资、税务、法律、保险或职业建议。'
    ]
  }
  if (profile.incomeBand !== 'undisclosed') {
    const incomeRange = INCOME_BANDS[profile.incomeBand]
    const currentPathSignal = profile.nearTermSignal === 'pressure' ? 'pressure' : 'no_confirmed_change'
    result.tenYearIncome = {
      bear: annualTotal(incomeRange, assumption, 'bear', currentPathSignal),
      base: annualTotal(incomeRange, assumption, 'base', currentPathSignal)
    }
    result.displayIncome = {
      bear: formatRange(result.tenYearIncome.bear),
      base: formatRange(result.tenYearIncome.base)
    }
    if (profile.nearTermSignal === 'confirmed_up') {
      const confirmed = annualTotal(incomeRange, assumption, 'base', 'confirmed_up')
      result.tenYearIncome.confirmed = confirmed
      result.displayIncome.confirmed = formatRange(confirmed)
    }
  }
  return result
}

module.exports = { ENGINE_VERSION, calculateQuick, formatRange, INCOME_BANDS, WORK_ASSUMPTIONS }
