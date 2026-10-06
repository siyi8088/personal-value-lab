/**
 * 个人现金流 DCF 计算内核 (Personal Cash Flow DCF Engine) - v2.0
 *
 * 核心原理：
 * 1. 显性工作期：劳动收入为有限期现金流，绝非永续。
 * 2. 短期调整与职业风险：支持 4 类（上行 g>0、下行 g<0、保持现状 g=0、失业风险较高-5年断崖）。
 * 3. 退休后有限现金流：按今天购买力下的体感四档锚定（1500 / 3000 / 8000 / 0），有限期年金折现。
 * 4. 严格终值（Gordon TV）：仅在具备独立持续经营收入引擎且通过再投资校验（g/RIR）时计算。
 * 5. 防双计原则：恪守企业 DCF 纪律，不衡量人的价值。
 */

const { calculateStatutoryRetirement } = require('./retirement')

const ENGINE_VERSION = 'quick-v2.0.0'
const DEFAULT_DISCOUNT_RATE = 0.035 // 3.5% 真实风险调整折现率（扣除通胀）
const DEFAULT_LIFE_EXPECTANCY = 82   // 预期寿命基准年限
const TERMINAL_GROWTH_RATE = 0.01    // 终值保守长期增长率上限 1%
const RECURRING_RETURN_RATE = 0.08   // 收入引擎回报率 RIR 8%

const AGE_BAND_MAP = {
  '18_24': 22,
  '25_29': 27,
  '30_34': 32,
  '35_39': 37,
  '40_49': 45,
  '50_plus': 53
}

const INCOME_BANDS = {
  under_5k: [2500, 5000],
  '5_8k': [5000, 8000],
  '8_12k': [8000, 12000],
  '12_20k': [12000, 20000],
  '20_35k': [20000, 35000],
  '35_50k': [35000, 50000],
  '50_80k': [50000, 80000],
  '80k_plus': [80000, 120000]
}

const WORK_ASSUMPTIONS = {
  stable_employed: { downside: 0.06, stability: '较高' },
  employed_variable: { downside: 0.1, stability: '中等' },
  project: { downside: 0.16, stability: '较低' },
  business: { downside: 0.2, stability: '较低' },
  transition: { downside: 0.26, stability: '较低' }
}

// 兼容旧版的 nearTermSignal
const NEAR_TERM_SIGNALS = {
  confirmed_up: [0.06, 0.02],
  no_confirmed_change: [0, 0],
  pressure: [-0.08, -0.02],
  unclear: [0, 0]
}

// 新版 Step 3：短期调整与职业风险 4 分类
const CAREER_RISKS = {
  upside: { id: 'upside', title: '稳中有升', rates: [0.06, 0.05, 0.04], maxWorkYears: Infinity },
  downside: { id: 'downside', title: '行业承压', rates: [-0.06, -0.05, -0.04], maxWorkYears: Infinity },
  steady: { id: 'steady', title: '平稳维持', rates: [0, 0, 0], maxWorkYears: Infinity },
  unemployment_risk: { id: 'unemployment_risk', title: '中断风险', rates: [0, 0, 0], maxWorkYears: 5 }
}

// 新版 Step 4：退休后生活体感 4 档锚定 (月度金额)
const PENSION_TIERS = {
  basic: { id: 'basic', title: '基础温饱', monthlyAmount: 1500, description: '城乡居保或低基数兜底保障' },
  average: { id: 'average', title: '工薪平均', monthlyAmount: 3000, description: '贴合全国企退职工平均水平' },
  affluent: { id: 'affluent', title: '较充裕 / 体制内', monthlyAmount: 8000, description: '机关事业单位、高工龄或含年金' },
  none: { id: 'none', title: '暂不纳入模型', monthlyAmount: 0, description: '观察完全自持能力下的现金流' },
  custom: { id: 'custom', title: '自定义金额', monthlyAmount: 0, description: '用户自定义月度养老现金流' }
}

/**
 * 根据现金流 DCF 结构与画像，动态生成 3 项核心系统优化策略备忘
 */
function resolveSystemActions(dcf, profile, careerRisk, statutoryAge) {
  const hasCliff = careerRisk && careerRisk.id === 'unemployment_risk'
  const isVolatileWork = ['project', 'business', 'transition'].includes(profile.workType)
  const hasEngine = profile.hasRecurringEngine && profile.hasRecurringEngine !== 'none'
  const isLowPension = ['basic', 'none'].includes(profile.pensionTier)

  // 1. 防御端：显性期缓冲仓
  const defenseAction = (hasCliff || isVolatileWork)
    ? {
        id: 'action-defense',
        pillarTag: '🛡️ 防御端 · 显性期缓冲',
        title: '建立 6–12 个月刚性生活缓冲仓',
        period: '本月启动',
        rationale: '隔离房贷与生活硬开支于高流动资产中，阻断主业波动直接引发断崖。',
        firstStep: '按“房贷月供 + 基础生活费”核算出 6 个月的刚性底线金额，设立独立隔离账户。'
      }
    : {
        id: 'action-defense',
        pillarTag: '🛡️ 防御端 · 显性期缓冲',
        title: '锁定基础生活现金安全垫',
        period: '下个发薪日',
        rationale: '优先备足 3~6 个月刚性开支缓冲，在职场转换与进阶时保持从容底气。',
        firstStep: '设定发薪日自动转存规则，优先补足应急流动性资产。'
      }

  // 2. 进攻端：终值造血
  const offenseAction = hasEngine
    ? {
        id: 'action-offense',
        pillarTag: '🚀 进攻端 · 终值造血',
        title: '降低造血引擎对日常精力的依赖',
        period: '本季度落地',
        rationale: '提升自动化与分红水平，让收益脱离肉身打卡、跨越退休周期独立运转。',
        firstStep: '梳理现有业务的日常维护耗时，明确哪些环节可流程化或沉淀为数字资产。'
      }
    : {
        id: 'action-offense',
        pillarTag: '🚀 进攻端 · 终值造血',
        title: '启动第一项独立造血验证',
        period: '本季度落地',
        rationale: '以最小成本验证一项技能变现或数字资产，为自己培育脱离打卡的第二现金流。',
        firstStep: '梳理一项可复用的专业能力或数字资产，低成本验证 1~2 个真实付费需求（专栏、微咨询或独立小工具）。'
      }

  // 3. 后半场：制度兜底与年金
  const retirementAction = isLowPension
    ? {
        id: 'action-retirement',
        pillarTag: '🌱 后半场 · 制度兜底',
        title: '补齐退休现金流基础防线',
        period: '年内规划',
        rationale: '提早规划第三支柱商业年金，避免退休后出现生活品质断层。',
        firstStep: '测算每年 12,000 元个人养老金税优额度，或考察稳健型养老年金产品。'
      }
    : {
        id: 'action-retirement',
        pillarTag: '🌱 后半场 · 制度兜底',
        title: '对齐退休节点的年金布局',
        period: '年内规划',
        rationale: '依据法定退休年龄核算统筹缺口，提前建立稳定的晚年被动年金安全垫。',
        firstStep: '登录个人所得税或社保平台核对缴费年限与预计替代率，评估补充商业年金的适当时点。'
      }

  return [defenseAction, offenseAction, retirementAction]
}

// 现金流人设文案库：根据主力支柱动态判定，并支持随机变体
const PERSONA_LIBRARY = {
  labor_dominant: [
    {
      id: 'labor_generator',
      badge: '🏃‍♂️ 肉身发电系统',
      tagline: '主要依靠：本人持续上班',
      summary: (d) => `典型的人力发电机。你不上班系统当场断电；好消息是目前发电机马力正足，坏消息是它有严格的“报废年限”（${d.statutoryAge}岁）。趁着还能发电，多给系统装几个备用油箱吧。`,
      punchline: '“不上班就断电，好在目前马力正足。”',
      sub: (d) => `系统 ${d.dcf.ratios.workingRatio}% 靠肉身打卡`
    },
    {
      id: 'labor_unicorn',
      badge: '🏢 一人独角兽系统',
      tagline: '主要依靠：本人持续上班',
      summary: (d) => `你一个人撑起了一家微型上市公司：研发、销售、保洁全是你，100% 营收靠董事长肉身下地干活。没有外包没有睡后收入，到了 ${d.statutoryAge} 岁董事长还得强制退休。`,
      punchline: '“董事长亲自搬砖，且暂无接班人。”',
      sub: (d) => `系统 ${d.dcf.ratios.workingRatio}% 靠肉身打卡`
    },
    {
      id: 'labor_battery',
      badge: '🔋 纯电驱动型系统',
      tagline: '主要依靠：本人持续上班',
      summary: (d) => `全靠自驱电池驱动的纯血打工人。当前输出极其稳定，但续航完全取决于出勤与精力。趁着电量满格，记得尽早配置被动充电桩。`,
      punchline: '“全靠自驱电池，急需被动充电桩。”',
      sub: (d) => `系统 ${d.dcf.ratios.workingRatio}% 靠肉身打卡`
    },
    {
      id: 'labor_bee',
      badge: '🐝 勤勉工蜂系统',
      tagline: '主要依靠：本人持续上班',
      summary: (d) => `飞得勤才有蜜吃。每一分现金流都带着打卡的汗水与工位芳香。属于抗风险全靠自身肌肉记忆的硬核实力派，但肌肉总有需要休息的一天。`,
      punchline: '“飞得勤才有蜜吃，肌肉总有下班时。”',
      sub: (d) => `系统 ${d.dcf.ratios.workingRatio}% 靠肉身打卡`
    },
    {
      id: 'labor_brick',
      badge: '🧱 纯手工搬砖系统',
      tagline: '主要依靠：本人持续上班',
      summary: (d) => `最古老也最踏实的收入模式。你的时间就是真金白银；既然时间有上限，未来要么提高单小时售价，要么让资产也学着跟着搬砖。`,
      punchline: '“时间就是真金白银，可惜时间有上限。”',
      sub: (d) => `系统 ${d.dcf.ratios.workingRatio}% 靠肉身打卡`
    }
  ],
  pension_dominant: [
    {
      id: 'pension_spoiled',
      badge: '🏖️ 未来包养系统',
      tagline: '主要依靠：退休后国家保障',
      summary: (d) => `未来的你比现在的你更有钱！工作期早早交棒，后半生全靠国家社保撑腰。对你来说性价比最高的财务动作就是：吃好睡好，争取长命百岁，把养老金领到极致。`,
      punchline: '“前半生全靠硬撑，后半生全靠社保。”',
      sub: (d) => `退休后现金流占比 ${d.dcf.ratios.postWorkTotalRatio}%`
    },
    {
      id: 'pension_calm',
      badge: '🍵 佛系后半场系统',
      tagline: '主要依靠：退休后国家保障',
      summary: (d) => `上班只是漫长人生的热身赛，退休后的现金流才是真正的压舱石。后半场稳如泰山，当前重点是稳住身心节奏，平稳滑行到着陆区。`,
      punchline: '“上班只是热身赛，真正大头在退休后。”',
      sub: (d) => `退休后现金流占比 ${d.dcf.ratios.postWorkTotalRatio}%`
    }
  ],
  strict_tv: [
    {
      id: 'tv_capitalist',
      badge: '⚙️ 自带造血引擎',
      tagline: '主要依靠：独立收入引擎',
      summary: (d) => `恭喜解锁企业 DCF 里最奢华的 Gordon 终值！即便你停止打卡，独立引擎还在后方突突造血。打工对你只是社会体验，你已经有了跳出打卡循环的底气。`,
      punchline: '“打工只是社会体验，睡后资产才是本体。”',
      sub: (d) => `严格终值占比 ${d.dcf.ratios.strictTvRatio}%`
    },
    {
      id: 'tv_money_tree',
      badge: '🌱 资产摇钱树系统',
      tagline: '主要依靠：独立收入引擎',
      summary: (d) => `别人在出卖时间，你的资产在替你打工。只要每年按时做好维护与再投资，这个系统就能脱离你的肉身，持续陪你走得很远。`,
      punchline: '“别人出卖时间，我的资产在替我打工。”',
      sub: (d) => `严格终值占比 ${d.dcf.ratios.strictTvRatio}%`
    }
  ],
  balanced: [
    {
      id: 'balanced_relay',
      badge: '⚖️ 半场接力系统',
      tagline: '势均力敌：前后半场接力',
      summary: (d) => `教科书般的前后半场配合。前半生靠自己持续打工发电，后半生靠制度保障平稳着陆，谁也不抢谁的风头，属于极其稳健的防御型系统。`,
      punchline: '“前半场自己发电，后半场制度接盘。”',
      sub: () => '攻守兼备的稳健体质'
    },
    {
      id: 'balanced_dual',
      badge: '🛡️ 双轮平衡系统',
      tagline: '势均力敌：前后半场接力',
      summary: (d) => `劳动现金流与未来兜底保障旗鼓相当。既没有过度依赖肉身的焦虑，也没有空想暴富的幻觉，稳扎稳打走得最远。`,
      punchline: '“不靠暴富靠平衡，稳扎稳打走得最远。”',
      sub: () => '工作期与退休金势均力敌'
    }
  ]
}

function resolvePersona(dcf, statutoryAge, expectedRetirementAge) {
  const { workingRatio, postRetirementRatio, strictTvRatio } = dcf.ratios
  let type = 'labor_dominant'
  let dominantPillar = 'working'

  if (strictTvRatio >= 30 || (strictTvRatio > workingRatio && strictTvRatio > postRetirementRatio)) {
    type = 'strict_tv'
    dominantPillar = 'strictTv'
  } else if (Math.abs(workingRatio - postRetirementRatio) <= 12 && workingRatio >= 35 && postRetirementRatio >= 35) {
    type = 'balanced'
    dominantPillar = 'balanced'
  } else if (postRetirementRatio > workingRatio) {
    type = 'pension_dominant'
    dominantPillar = 'pension'
  } else {
    type = 'labor_dominant'
    dominantPillar = 'working'
  }

  const pool = PERSONA_LIBRARY[type] || PERSONA_LIBRARY.labor_dominant
  const index = Math.floor(Math.random() * pool.length)
  const item = pool[index]
  const ctx = { statutoryAge, expectedRetirementAge, dcf }

  return {
    id: item.id,
    type,
    dominantPillar,
    badge: item.badge,
    tagline: item.tagline,
    summary: item.summary(ctx),
    punchline: item.punchline,
    sub: item.sub(ctx)
  }
}

function resolveCurrentAge(profile) {
  if (profile.birthYear) {
    const currentYear = new Date().getFullYear()
    return Math.max(18, currentYear - profile.birthYear)
  }
  if (profile.currentAge) return Number(profile.currentAge)
  if (profile.ageBand && AGE_BAND_MAP[profile.ageBand]) {
    return AGE_BAND_MAP[profile.ageBand]
  }
  return 30 // 默认值
}

function resolveCareerRisk(profile) {
  if (profile.careerRisk && CAREER_RISKS[profile.careerRisk]) {
    return CAREER_RISKS[profile.careerRisk]
  }
  // 兼容老版本的 nearTermSignal
  if (profile.nearTermSignal === 'confirmed_up') return CAREER_RISKS.upside
  if (profile.nearTermSignal === 'pressure') return CAREER_RISKS.downside
  if (profile.nearTermSignal === 'no_confirmed_change' || profile.nearTermSignal === 'unclear') {
    return CAREER_RISKS.steady
  }
  return CAREER_RISKS.steady
}

function assertProfile(profile) {
  if (!profile) {
    throw new Error('请完成所有必答问题。')
  }
  const hasAge = profile.ageBand || profile.birthYear || profile.currentAge
  const hasSignal = profile.careerRisk || profile.nearTermSignal
  if (!hasAge || !profile.incomeBand || !profile.workType || !hasSignal) {
    throw new Error('请完成所有必答问题。')
  }
  if (profile.incomeBand !== 'undisclosed' && !INCOME_BANDS[profile.incomeBand]) {
    throw new Error('收入区间无效。')
  }
  if (!WORK_ASSUMPTIONS[profile.workType]) {
    throw new Error('工作状态信息无效。')
  }
}

function trajectoryFor(profile) {
  if (profile.workType === 'transition') {
    return { id: 'rebuilding', title: '重建调整型', description: '当前先稳住可承受周期，再验证新的收入路径。' }
  }
  if (profile.workType === 'project' || profile.workType === 'business') {
    return { id: 'variable_operator', title: '波动进攻型', description: '收入弹性较大；优先分清高峰收入与可持续收入。' }
  }
  const risk = resolveCareerRisk(profile)
  if (risk.id === 'upside') {
    return { id: 'confirmed_change', title: '短期变化已确认', description: '把已经发生或确定的变化计入前两年，之后仍按保守基线看待。' }
  }
  if (risk.id === 'unemployment_risk') {
    return { id: 'cliff_risk', title: '断崖防范型', description: '劳动收入受周期或年龄影响较大；需要尽快建立安全垫与退休后现金流。' }
  }
  return { id: 'steady_builder', title: '稳步积累型', description: '你的路径更依赖持续积累；关注下一档能力与缓冲。' }
}

function formatWan(value) {
  const wan = value / 10000
  if (wan < 1) return `${Math.round(wan * 10) / 10} 万`
  if (wan < 10) return `${Math.round(wan)} 万`
  return `${Math.round(wan / 5) * 5} 万`
}

function formatRange(range) {
  if (!range) return ''
  return `${formatWan(range.low)} – ${formatWan(range.high)}`
}

/**
 * 核心现金流折现（DCF）三段式计算
 */
function calculateDcf(profile, currentAge, expectedRetirementAge) {
  const r = DEFAULT_DISCOUNT_RATE
  const careerRisk = resolveCareerRisk(profile)
  const isUndisclosed = profile.incomeBand === 'undisclosed'

  // 1. 显性工作年限判定
  const totalWorkYearsPossible = Math.max(0, expectedRetirementAge - currentAge)
  const activeWorkYears = Math.min(careerRisk.maxWorkYears, totalWorkYearsPossible)
  const cliffYears = totalWorkYearsPossible - activeWorkYears
  const hasCliff = careerRisk.id === 'unemployment_risk' && cliffYears > 0

  // 2. 显性工作期现金流现值计算 (Working Period PV)
  let workingPv = { low: 0, high: 0, mid: 0 }
  if (!isUndisclosed) {
    const monthlyRange = INCOME_BANDS[profile.incomeBand]
    const calcWorkingPvForMonthly = (monthly) => {
      let pv = 0
      let yearlyCashFlow = monthly * 12
      for (let t = 1; t <= totalWorkYearsPossible; t += 1) {
        if (t <= activeWorkYears) {
          if (t <= 3 && careerRisk.rates[t - 1]) {
            yearlyCashFlow *= (1 + careerRisk.rates[t - 1])
          }
          pv += yearlyCashFlow / Math.pow(1 + r, t)
        } else {
          // 断崖期：失业风险下第 6 年起至退休前，劳动现金流为 0
          break
        }
      }
      return Math.round(pv)
    }

    const lowPv = calcWorkingPvForMonthly(monthlyRange[0])
    const highPv = calcWorkingPvForMonthly(monthlyRange[1])
    workingPv = {
      low: Math.min(lowPv, highPv),
      high: Math.max(lowPv, highPv),
      mid: Math.round((lowPv + highPv) / 2)
    }
  }

  // 3. 退休后有限现金流现值 (Post-Retirement Finite PV - 养老金)
  const pensionTierKey = profile.pensionTier || 'average'
  const pensionTier = PENSION_TIERS[pensionTierKey] || PENSION_TIERS.average
  let monthlyPension = pensionTier.monthlyAmount
  if (pensionTierKey === 'custom' && profile.customPensionMonthly) {
    monthlyPension = Number(profile.customPensionMonthly)
  }

  let postRetirePv = 0
  const annualPension = monthlyPension * 12
  if (annualPension > 0) {
    const retireStartYear = totalWorkYearsPossible + 1
    const retireEndYear = Math.max(retireStartYear, DEFAULT_LIFE_EXPECTANCY - currentAge)
    for (let t = retireStartYear; t <= retireEndYear; t += 1) {
      postRetirePv += annualPension / Math.pow(1 + r, t)
    }
  }
  postRetirePv = Math.round(postRetirePv)

  // 4. 严格终值现值 (Strict Terminal Value PV)
  // 必须满足独立持续经营且退休后可持续产生
  let strictTvPv = 0
  const hasEngine = profile.hasRecurringEngine && profile.hasRecurringEngine !== 'none'
  const isSustainable = Boolean(profile.engineMaintainedAfterRetire)
  const engineAnnualNet = Number(profile.engineAnnualNetCashFlow || 0)

  if (hasEngine && isSustainable && engineAnnualNet > 0) {
    const g = TERMINAL_GROWTH_RATE
    const rir = RECURRING_RETURN_RATE
    // Gordon 终值计算：再投资率 IR = g / RIR
    const reinvestmentRate = g / rir
    const fcfNext = engineAnnualNet * (1 - reinvestmentRate)
    if (r > g) {
      const tvAtRetirement = fcfNext / (r - g)
      strictTvPv = Math.round(tvAtRetirement / Math.pow(1 + r, totalWorkYearsPossible))
    }
  }

  // 5. 汇总与比例计算
  if (isUndisclosed) {
    return {
      moneyAvailable: false,
      workingPv: null,
      postRetirePv: null,
      strictTvPv: null,
      totalPv: null,
      ratios: {
        workingRatio: 70,
        postRetirementRatio: 30,
        strictTvRatio: 0,
        postWorkTotalRatio: 30
      },
      cliff: { hasCliff, cliffYears, activeWorkYears, totalWorkYearsPossible }
    }
  }

  const totalPvMid = workingPv.mid + postRetirePv + strictTvPv
  const workingRatio = totalPvMid > 0 ? Math.round((workingPv.mid / totalPvMid) * 100) : 0
  const postRetirementRatio = totalPvMid > 0 ? Math.round((postRetirePv / totalPvMid) * 100) : 0
  const strictTvRatio = totalPvMid > 0 ? Math.round((strictTvPv / totalPvMid) * 100) : 0
  const postWorkTotalRatio = postRetirementRatio + strictTvRatio

  return {
    moneyAvailable: true,
    workingPv,
    postRetirePv: { low: postRetirePv, high: postRetirePv, mid: postRetirePv },
    strictTvPv: { low: strictTvPv, high: strictTvPv, mid: strictTvPv },
    totalPv: {
      low: workingPv.low + postRetirePv + strictTvPv,
      high: workingPv.high + postRetirePv + strictTvPv,
      mid: totalPvMid
    },
    ratios: {
      workingRatio,
      postRetirementRatio,
      strictTvRatio,
      postWorkTotalRatio
    },
    cliff: {
      hasCliff,
      cliffYears,
      activeWorkYears,
      totalWorkYearsPossible
    }
  }
}

// 保留十年收入情景（兼容旧版本视图）
function annualTotalLegacy(monthlyRange, assumption, scenario, careerRisk) {
  const downsideMultiplier = scenario === 'bear' ? 1 - assumption.downside : 1
  const shortTermRates = careerRisk.rates
  const totals = monthlyRange.map((monthly) => {
    let total = 0
    let yearlyIncome = monthly * 12 * downsideMultiplier
    for (let year = 1; year <= 10; year += 1) {
      if (year > careerRisk.maxWorkYears) {
        break
      }
      if (year <= 3 && shortTermRates[year - 1]) yearlyIncome *= (1 + shortTermRates[year - 1])
      total += yearlyIncome
    }
    return Math.max(0, Math.round(total))
  })
  return { low: Math.min(totals[0], totals[1]), high: Math.max(totals[0], totals[1]) }
}

function calculateQuick(profile) {
  assertProfile(profile)
  const currentAge = resolveCurrentAge(profile)
  const gender = profile.gender || 'male'
  const birthYear = profile.birthYear || (new Date().getFullYear() - currentAge)

  const statutoryRetire = calculateStatutoryRetirement(birthYear, 6, gender)
  const statutoryAge = statutoryRetire.statutoryAgeRounded
  const expectedRetirementAge = profile.expectedRetirementAge
    ? Number(profile.expectedRetirementAge)
    : statutoryAge

  const careerRisk = resolveCareerRisk(profile)
  const assumption = WORK_ASSUMPTIONS[profile.workType]
  const trajectory = trajectoryFor(profile)

  const dcf = calculateDcf(profile, currentAge, expectedRetirementAge)
  const persona = resolvePersona(dcf, statutoryAge, expectedRetirementAge)

  const actions = resolveSystemActions(dcf, profile, careerRisk, statutoryAge)

  const result = {
    engineVersion: ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    trajectory,
    persona,
    stability: assumption.stability,
    currentAge,
    statutoryRetirementAge: statutoryAge,
    expectedRetirementAge,
    statutoryRetireInfo: statutoryRetire,
    careerRisk,
    dcf,
    actions,
    explanations: [
      '个人现金流系统按今天的购买力推演显性工作期、退休后有限现金流与独立终值。',
      '劳动收入为有限期现金流，到退休节点硬性停止；不假设工资永续。',
      '社保养老金属于退休后有限期年金现值，不计入 Gordon 永续终值。',
      dcf.cliff && dcf.cliff.hasCliff
        ? `在设定的中断风险下，劳动现金流仅计入未来 5 年；随后至法定退休（${statutoryAge}岁）有 ${dcf.cliff.cliffYears} 年收入真空期。`
        : '默认不假设长期工资增长；第 4 年起按真实购买力平稳基线折现。',
      '本模型估算现金流系统构成，不衡量个人价值与身价。'
    ],
    disclosures: [
      '这是基于少量自报信息的现金流教育模型，不衡量人的价值。',
      '结果不构成投资、税务、法律、保险或职业建议。'
    ]
  }

  // 格式化输出
  if (dcf.moneyAvailable) {
    result.displayDcf = {
      totalPv: formatRange(dcf.totalPv),
      workingPv: formatRange(dcf.workingPv),
      postRetirePv: formatWan(dcf.postRetirePv.mid),
      strictTvPv: dcf.strictTvPv.mid > 0 ? formatWan(dcf.strictTvPv.mid) : '0',
      workingRatio: `${dcf.ratios.workingRatio}%`,
      postRetirementRatio: `${dcf.ratios.postRetirementRatio}%`,
      strictTvRatio: `${dcf.ratios.strictTvRatio}%`,
      postWorkTotalRatio: `${dcf.ratios.postWorkTotalRatio}%`
    }

    // 保留旧版十年收入（供兼容）
    const incomeRange = INCOME_BANDS[profile.incomeBand]
    result.tenYearIncome = {
      bear: annualTotalLegacy(incomeRange, assumption, 'bear', careerRisk),
      base: annualTotalLegacy(incomeRange, assumption, 'base', careerRisk)
    }
    result.displayIncome = {
      bear: formatRange(result.tenYearIncome.bear),
      base: formatRange(result.tenYearIncome.base)
    }
    if (careerRisk.id === 'upside') {
      result.tenYearIncome.confirmed = result.tenYearIncome.base
      result.displayIncome.confirmed = result.displayIncome.base
    }
  }

  return result
}

module.exports = {
  ENGINE_VERSION,
  DEFAULT_DISCOUNT_RATE,
  DEFAULT_LIFE_EXPECTANCY,
  INCOME_BANDS,
  WORK_ASSUMPTIONS,
  CAREER_RISKS,
  PENSION_TIERS,
  PERSONA_LIBRARY,
  calculateQuick,
  formatRange,
  formatWan
}
