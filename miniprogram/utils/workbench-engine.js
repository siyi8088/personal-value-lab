/**
 * 个人现金流 DCF 工作台内核 (Workbench Engine) - v1.0
 *
 * 核心功能：
 * 1. 个人自由现金流（PFCF）双口径计算（收入能力口径 vs 可支配自由现金流口径）
 * 2. 多收入流、资产负债防双重计价（NAV vs 收益法互斥）
 * 3. 假设实验室：r × g 敏感性矩阵热力图
 * 4. 目标价值倒推（反向 DCF 求解器：职场增量、持续造血、资产储蓄 3 条等价路径）
 * 5. 现实检验与苛刻度评级系统（低 / 中 / 高）
 */

const DEFAULT_DISCOUNT_RATE = 0.035
const DEFAULT_TERMINAL_GROWTH = 0.01
const DEFAULT_RECURRING_RETURN = 0.08
const DEFAULT_LIFE_EXPECTANCY = 82

const INCOME_BAND_ANNUAL_MAP = {
  under_5k: 48000,
  '5_8k': 78000,
  '8_12k': 120000,
  '12_20k': 192000,
  '20_35k': 330000,
  '35_50k': 510000,
  '50_80k': 780000,
  '80k_plus': 1200000,
  undisclosed: 120000
}

const PENSION_TIER_MAP = {
  basic: 18000,
  average: 36000,
  affluent: 96000,
  none: 0
}

const WORK_TYPE_NAMES = {
  stable_employed: '主要受雇工资收入',
  employed_variable: '工薪 + 绩效奖金',
  project: '自由职业 / 项目收入',
  business: '自营业务经营收入',
  transition: '灵活用工 / 过渡收入'
}

/**
 * 校验并初始化工作台 Profile（可继承轻量版问卷 draft 数据）
 */
function createDefaultWorkbenchProfile(overrides = {}, draft = null) {
  const currentAge = Number(draft?.currentAge || draft?.age || 32)
  const statutoryRetirementAge = Number(draft?.statutoryAge || draft?.statutoryRetirementAge || 63)
  const expectedRetirementAge = Number(draft?.expectedRetirementAge || statutoryRetirementAge)

  // 1. 主要职业收入流初始化（从 draft 映射）
  let primaryName = '主要职业收入'
  let primaryKind = 'labor'
  let primaryAmount = 120000
  let primaryMaintenance = 6000
  let primaryEndAge = expectedRetirementAge
  let primaryTv = false

  if (draft) {
    if (draft.workType) {
      primaryName = WORK_TYPE_NAMES[draft.workType] || '主要职业收入'
      if (draft.workType === 'business') {
        primaryKind = 'business'
        primaryTv = true
      } else if (draft.workType === 'project') {
        primaryKind = 'side_job'
      }
    }
    if (draft.incomeBand && INCOME_BAND_ANNUAL_MAP[draft.incomeBand]) {
      primaryAmount = INCOME_BAND_ANNUAL_MAP[draft.incomeBand]
      primaryMaintenance = Math.round(primaryAmount * 0.05)
    }
    // 职业断崖判断
    if (draft.careerRisk === 'unemployment_risk') {
      primaryEndAge = Math.min(currentAge + 5, expectedRetirementAge)
    }
  }

  const incomeStreams = [
    {
      id: 'stream_primary_job',
      name: primaryName,
      kind: primaryKind,
      annualAmount: primaryAmount,
      startAge: currentAge,
      endAge: primaryEndAge,
      maintenanceCost: primaryMaintenance,
      supportsTerminalValue: primaryTv
    }
  ]

  // 2. 养老金流（从 draft 映射）
  const pensionAmount = draft && draft.pensionTier ? (PENSION_TIER_MAP[draft.pensionTier] ?? 36000) : 36000
  if (pensionAmount > 0) {
    incomeStreams.push({
      id: 'stream_social_pension',
      name: '基础养老金',
      kind: 'pension',
      annualAmount: pensionAmount,
      startAge: expectedRetirementAge,
      endAge: DEFAULT_LIFE_EXPECTANCY,
      maintenanceCost: 0,
      supportsTerminalValue: false
    })
  }

  // 3. 独立持续造血流（若 draft 中有）
  if (draft && draft.hasRecurringEngine && draft.hasRecurringEngine !== 'none') {
    const engineNames = {
      rental: '出租物业净租金',
      business: '自营分红/股权收益',
      royalty: '独立版权/数字订阅'
    }
    incomeStreams.push({
      id: 'stream_recurring_engine',
      name: engineNames[draft.hasRecurringEngine] || '持续造血分红',
      kind: draft.hasRecurringEngine,
      annualAmount: Number(draft.engineAnnualNetCashFlow) || 30000,
      startAge: currentAge,
      endAge: DEFAULT_LIFE_EXPECTANCY,
      maintenanceCost: 2000,
      supportsTerminalValue: true
    })
  }

  return {
    basis: 'income_capacity', // 'income_capacity' | 'disposable_cashflow'
    currentAge,
    statutoryRetirementAge,
    expectedRetirementAge,
    lifeExpectancy: DEFAULT_LIFE_EXPECTANCY,
    discountRate: DEFAULT_DISCOUNT_RATE,
    terminalGrowthRate: DEFAULT_TERMINAL_GROWTH,
    recurringIncomeReturn: DEFAULT_RECURRING_RETURN,
    incomeStreams,
    expenses: [
      {
        id: 'exp_living',
        name: '基本刚性生活支出',
        category: 'living',
        annualAmount: 48000,
        startAge: currentAge,
        endAge: DEFAULT_LIFE_EXPECTANCY
      },
      {
        id: 'exp_mortgage',
        name: '房贷月供',
        category: 'mortgage',
        annualAmount: 36000,
        startAge: currentAge,
        endAge: Math.min(currentAge + 20, DEFAULT_LIFE_EXPECTANCY)
      }
    ],
    assets: [
      {
        id: 'asset_savings',
        name: '流动资金与定存',
        category: 'cash_deposit',
        conservativeValue: 80000,
        valuationMethod: 'nav',
        linkedIncomeStreamId: null
      }
    ],
    liabilities: [],
    targetGoal: {
      targetPcsv: 3000000,
      realityCheck: {
        hasCustomerBase: false,
        hasTimeCapital: false,
        toleratesZeroGrowth: false,
        hasDownsideBuffer: false
      }
    },
    ...overrides
  }
}

/**
 * 资产防双重计价校验
 */
function validateDoubleCounting(profile) {
  const errors = []
  const cashflowAssetIds = new Set()

  for (const asset of profile.assets || []) {
    if (asset.valuationMethod === 'cashflow' && asset.linkedIncomeStreamId) {
      cashflowAssetIds.add(asset.linkedIncomeStreamId)
    }
  }

  // 检查是否有资产既在 NAV 中计入了市值，又将其关联的租金/分红折现
  for (const asset of profile.assets || []) {
    if (asset.valuationMethod === 'nav' && asset.linkedIncomeStreamId) {
      const stream = (profile.incomeStreams || []).find(s => s.id === asset.linkedIncomeStreamId)
      if (stream) {
        errors.push(`资产【${asset.name}】已按 NAV（市值法）计入净资产，禁止同时将其关联收入流【${stream.name}】进行折现，存在双重计价！`)
      }
    }
  }

  return { isValid: errors.length === 0, errors }
}

/**
 * 正向全量 DCF 计算（输出瀑布流明细、总现值与双口径对比）
 */
function calculateForwardDcf(profile) {
  const doubleCountingCheck = validateDoubleCounting(profile)
  if (!doubleCountingCheck.isValid) {
    throw new Error(doubleCountingCheck.errors[0])
  }

  const r = Number(profile.discountRate || DEFAULT_DISCOUNT_RATE)
  const g = Number(profile.terminalGrowthRate || DEFAULT_TERMINAL_GROWTH)
  const rir = Number(profile.recurringIncomeReturn || DEFAULT_RECURRING_RETURN)
  const currentAge = Number(profile.currentAge)
  const expectedRetire = Number(profile.expectedRetirementAge || profile.statutoryRetirementAge)
  const lifeExp = Number(profile.lifeExpectancy || DEFAULT_LIFE_EXPECTANCY)
  const totalYears = Math.max(1, lifeExp - currentAge)
  const isNetBasis = profile.basis === 'disposable_cashflow'

  // 1. 年现金流流水展开
  const yearlyBreakdown = []
  let workingPv = 0
  let pensionPv = 0
  let strictTvPv = 0

  for (let t = 1; t <= totalYears; t += 1) {
    const age = currentAge + t
    const discountFactor = Math.pow(1 + r, t)

    // 汇总本年度收入
    let grossIncome = 0
    let maintenance = 0
    let laborAmount = 0
    let pensionAmount = 0
    let businessAmount = 0

    for (const stream of profile.incomeStreams || []) {
      const start = Number(stream.startAge || currentAge)
      const end = Number(stream.endAge || lifeExp)
      if (age > start && age <= end) {
        const netStream = Math.max(0, Number(stream.annualAmount || 0) - Number(stream.maintenanceCost || 0))
        grossIncome += Number(stream.annualAmount || 0)
        maintenance += Number(stream.maintenanceCost || 0)

        if (['labor', 'side_job'].includes(stream.kind)) {
          laborAmount += netStream
          workingPv += netStream / discountFactor
        } else if (['pension', 'annuity'].includes(stream.kind)) {
          pensionAmount += netStream
          pensionPv += netStream / discountFactor
        } else {
          businessAmount += netStream
          // 独立经营项在显性期内的现金流
          if (age <= expectedRetire) {
            workingPv += netStream / discountFactor
          } else {
            pensionPv += netStream / discountFactor
          }
        }
      }
    }

    // 汇总本年度刚性支出
    let livingExpense = 0
    let mortgageExpense = 0
    let totalExpense = 0

    if (isNetBasis) {
      for (const exp of profile.expenses || []) {
        const start = Number(exp.startAge || currentAge)
        const end = Number(exp.endAge || lifeExp)
        if (age > start && age <= end) {
          const amt = Number(exp.annualAmount || 0)
          totalExpense += amt
          if (exp.category === 'mortgage') mortgageExpense += amt
          else livingExpense += amt
        }
      }
    }

    const netPfcf = Math.max(-500000, (grossIncome - maintenance) - totalExpense)
    yearlyBreakdown.push({
      yearIndex: t,
      age,
      grossIncome,
      maintenance,
      totalExpense,
      netPfcf,
      discountFactor,
      discountedPfcf: Math.round(netPfcf / discountFactor)
    })
  }

  // 如果是可支配口径，用扣减支出后的折现总和重算工作期现值
  if (isNetBasis) {
    const workYears = Math.max(0, expectedRetire - currentAge)
    let netWorkPv = 0
    let netPostPv = 0
    yearlyBreakdown.forEach((item, idx) => {
      if (idx < workYears) netWorkPv += item.discountedPfcf
      else netPostPv += item.discountedPfcf
    })
    workingPv = netWorkPv
    pensionPv = netPostPv
  }

  // 2. 严格终值（Gordon TV）计算
  const qualifyingStreams = (profile.incomeStreams || []).filter(
    s => s.supportsTerminalValue && ['business', 'rental', 'royalty'].includes(s.kind)
  )

  const workYearsPossible = Math.max(0, expectedRetire - currentAge)
  if (qualifyingStreams.length > 0 && r > g && rir > g) {
    const reinvestmentRate = g / rir
    let totalAnnualEngineNet = 0
    for (const qs of qualifyingStreams) {
      totalAnnualEngineNet += Math.max(0, Number(qs.annualAmount || 0) - Number(qs.maintenanceCost || 0))
    }
    const fcfNext = totalAnnualEngineNet * (1 - reinvestmentRate)
    const tvAtRetire = fcfNext / (r - g)
    strictTvPv = Math.round(tvAtRetire / Math.pow(1 + r, workYearsPossible))
  }

  // 3. 资产法净资产（NAV）计算（扣除未纳入支出流的纯负债本金）
  let totalNavAssets = 0
  for (const asset of profile.assets || []) {
    if (asset.valuationMethod === 'nav') {
      totalNavAssets += Number(asset.conservativeValue || 0)
    }
  }

  let totalLiabilitiesToDeduct = 0
  for (const liab of profile.liabilities || []) {
    if (!liab.includedInExpenses) {
      totalLiabilitiesToDeduct += Number(liab.balance || 0)
    }
  }
  const netNav = Math.max(-1000000, totalNavAssets - totalLiabilitiesToDeduct)

  // 4. 汇总总现值与占比
  workingPv = Math.round(workingPv)
  pensionPv = Math.round(pensionPv)
  strictTvPv = Math.round(strictTvPv)
  const totalPcsv = workingPv + pensionPv + strictTvPv + netNav

  const safeTotal = Math.max(1, totalPcsv)
  const ratios = {
    workingRatio: Math.max(0, Math.round((workingPv / safeTotal) * 100)),
    pensionRatio: Math.max(0, Math.round((pensionPv / safeTotal) * 100)),
    strictTvRatio: Math.max(0, Math.round((strictTvPv / safeTotal) * 100)),
    navRatio: Math.max(0, Math.round((netNav / safeTotal) * 100)),
    postWorkTotalRatio: Math.max(0, Math.round(((pensionPv + strictTvPv) / safeTotal) * 100))
  }

  return {
    profile,
    basis: profile.basis,
    workingPv,
    pensionPv,
    strictTvPv,
    netNav,
    totalPcsv,
    ratios,
    yearlyBreakdown,
    workingWan: Math.round(workingPv / 10000),
    pensionWan: Math.round(pensionPv / 10000),
    strictTvWan: Math.round(strictTvPv / 10000),
    netNavWan: Math.round(netNav / 10000),
    totalWan: Math.round(totalPcsv / 10000)
  }
}

/**
 * 格式化百分比显示（如 0.0025 -> "0.25%", 0.005 -> "0.5%", 0.01 -> "1.0%", 0.035 -> "3.5%"）
 */
function formatRateLabel(rate) {
  const pct = Math.round(rate * 10000) / 100
  return Number.isInteger(pct) ? `${pct}.0%` : `${pct}%`
}

/**
 * r × g 敏感性矩阵生成器（支持动态以当前 r, g 为中心生成前后各两档）
 */
function calculateSensitivityMatrix(
  profile,
  customRList = null,
  customGList = null
) {
  const centerR = Math.round(Number(profile.discountRate || DEFAULT_DISCOUNT_RATE) * 1000) / 1000
  const centerG = Math.round(Number(profile.terminalGrowthRate || DEFAULT_TERMINAL_GROWTH) * 10000) / 10000

  // 若未指定自定义轴，则动态以 centerR, centerG 为中心生成：
  // r: 步长 0.5% (0.005)，前后各 2 档 (共 5 行)
  // g: 步长 0.25% (0.0025)，前后各 2 档 (共 5 列)
  const rList = customRList || [-2, -1, 0, 1, 2].map(i => {
    return Math.max(0.01, Math.round((centerR + i * 0.005) * 1000) / 1000)
  })
  const gList = customGList || [-2, -1, 0, 1, 2].map(i => {
    return Math.max(0, Math.round((centerG + i * 0.0025) * 10000) / 10000)
  })

  const matrix = []
  let minPcsv = Infinity
  let maxPcsv = -Infinity

  for (const r of rList) {
    const row = {
      r,
      rLabel: formatRateLabel(r),
      values: []
    }
    for (const g of gList) {
      if (r <= g) {
        row.values.push({
          g,
          gLabel: formatRateLabel(g),
          totalPcsv: null,
          displayWan: '—',
          invalid: true
        })
      } else {
        const testProfile = {
          ...profile,
          discountRate: r,
          terminalGrowthRate: g
        }
        const result = calculateForwardDcf(testProfile)
        const displayWan = Math.round(result.totalPcsv / 10000)
        if (result.totalPcsv < minPcsv) minPcsv = result.totalPcsv
        if (result.totalPcsv > maxPcsv) maxPcsv = result.totalPcsv

        row.values.push({
          g,
          gLabel: formatRateLabel(g),
          totalPcsv: result.totalPcsv,
          displayWan,
          invalid: false
        })
      }
    }
    matrix.push(row)
  }

  // 计算热力等级 (1..5) 与标记当前中心坐标
  const range = maxPcsv - minPcsv
  for (const row of matrix) {
    for (const cell of row.values) {
      cell.isCenter = Math.abs(cell.g - centerG) < 0.0001 && Math.abs(row.r - centerR) < 0.0001
      if (cell.invalid || cell.totalPcsv === null) {
        cell.heatLevel = 0
      } else if (range <= 0) {
        cell.heatLevel = 3
      } else {
        const ratio = (cell.totalPcsv - minPcsv) / range
        cell.heatLevel = Math.min(5, Math.max(1, Math.ceil(ratio * 5)))
      }
    }
  }

  const gLabels = gList.map(g => formatRateLabel(g))
  return { rList, gList, gLabels, matrix, centerR, centerG }
}

/**
 * 目标价值倒推求解器（反向 DCF：求解 3 条等价值路径）
 */
function calculateReverseDcf(profile, targetValue) {
  const forward = calculateForwardDcf(profile)
  const targetPcsv = Number(targetValue || profile.targetGoal?.targetPcsv || 3000000)
  const vKnown = forward.totalPcsv
  const gap = Math.max(0, targetPcsv - vKnown)

  const r = Number(profile.discountRate || DEFAULT_DISCOUNT_RATE)
  const g = Number(profile.terminalGrowthRate || DEFAULT_TERMINAL_GROWTH)
  const rir = Number(profile.recurringIncomeReturn || DEFAULT_RECURRING_RETURN)
  const currentAge = Number(profile.currentAge)
  const expectedRetire = Number(profile.expectedRetirementAge || profile.statutoryRetirementAge)
  const workYears = Math.max(1, expectedRetire - currentAge)

  // 路径 1：职场突破路径（工作年限内额外年 PFCF）
  // Gap = ExtraPFCF * \sum_{t=1}^{workYears} 1 / (1+r)^t
  let annuityDiscountFactorSum = 0
  for (let t = 1; t <= workYears; t += 1) {
    annuityDiscountFactorSum += 1 / Math.pow(1 + r, t)
  }
  const extraAnnualLaborPfcf = Math.round(gap / annuityDiscountFactorSum)

  // 路径 2：持续造血路径（退休时点所需首年持续净现金流）
  // Gap = [ RequiredFCF_{n+1} / (r - g) ] / (1 + r)^workYears
  // RequiredFCF_{n+1} = RequiredNetOperating * (1 - g/RIR)
  const reinvestmentRate = g / rir
  const requiredTvAtRetire = gap * Math.pow(1 + r, workYears)
  const requiredFcfNext = requiredTvAtRetire * (r - g)
  const requiredRecurringNetAnnual = reinvestmentRate < 1
    ? Math.round(requiredFcfNext / (1 - reinvestmentRate))
    : Math.round(requiredFcfNext)

  // 路径 3：资产储蓄路径（每月额外定投储蓄）
  // 假设按无风险利率 r 稳步复利滚存至退休时点所需本金折现
  const monthlyRate = Math.pow(1 + r, 1 / 12) - 1
  const totalMonths = workYears * 12
  // FV = PMT * [ (1+monthlyRate)^totalMonths - 1 ] / monthlyRate
  // PV(FV) = FV / (1+r)^workYears = Gap
  // -> PMT * [ (1+monthlyRate)^totalMonths - 1 ] / monthlyRate = Gap * (1+r)^workYears
  const futureValueNeeded = gap * Math.pow(1 + r, workYears)
  const monthlySavingsNeeded = Math.round(
    (futureValueNeeded * monthlyRate) / (Math.pow(1 + monthlyRate, totalMonths) - 1)
  )

  const paths = {
    laborPath: {
      id: 'path_labor',
      name: '职场突破路径',
      variableLabel: '每年额外税后自由现金流',
      annualAmount: extraAnnualLaborPfcf,
      annualWan: Math.round(extraAnnualLaborPfcf / 10000),
      monthlyAmount: Math.round(extraAnnualLaborPfcf / 12),
      years: workYears,
      description: `在剩余 ${workYears} 年工作期内，每年需多存留/多赚 ${Math.round(extraAnnualLaborPfcf / 10000)} 万元自由现金流。`
    },
    enginePath: {
      id: 'path_engine',
      name: '持续造血路径',
      variableLabel: '退休时首年独立净分红',
      annualAmount: requiredRecurringNetAnnual,
      annualWan: Math.round(requiredRecurringNetAnnual / 10000),
      monthlyAmount: Math.round(requiredRecurringNetAnnual / 12),
      description: `在退休前建立一项年净分红约 ${Math.round(requiredRecurringNetAnnual / 10000)} 万元的业务，且每年需保留再投资。`
    },
    savingsPath: {
      id: 'path_savings',
      name: '资产积累路径',
      variableLabel: '每月需额外刚性储蓄定投',
      annualAmount: monthlySavingsNeeded * 12,
      annualWan: Math.round((monthlySavingsNeeded * 12) / 10000),
      monthlyAmount: monthlySavingsNeeded,
      description: `保持当前收入与消费不变，每月需刚性储蓄定投约 ${monthlySavingsNeeded} 元至退休。`
    }
  }

  // 评估现实苛刻度评级
  const severity = evaluateSeverity(profile, targetPcsv, gap, vKnown, paths)

  return {
    targetPcsv,
    vKnown,
    gap,
    vKnownWan: Math.round(vKnown / 10000),
    gapWan: Math.round(gap / 10000),
    paths,
    severity
  }
}

/**
 * 现实检验与苛刻度评级判定
 */
function evaluateSeverity(profile, targetPcsv, gap, vKnown, paths) {
  const currentAnnualLabor = (profile.incomeStreams || [])
    .filter(s => ['labor', 'side_job'].includes(s.kind))
    .reduce((sum, s) => sum + Number(s.annualAmount || 0), 0) || 120000

  const gapRatio = vKnown > 0 ? gap / vKnown : 1
  const extraLaborRatio = paths.laborPath.annualAmount / currentAnnualLabor

  const reasons = []
  let severityScore = 0 // 0: 轻松, 1-2: 较苛刻, 3+: 高度苛刻

  if (gap === 0) {
    return {
      level: 'achieved',
      badge: '🎯 目标已达成',
      color: '#1b8166',
      title: '现有系统现值已覆盖目标',
      reasons: ['你目前的现金流系统现值已达到设定的目标值，具备较强的安全垫。'],
      advice: '可重点关注收入中断风险与极端情景压力测试。'
    }
  }

  if (gapRatio > 1.5) {
    severityScore += 2
    reasons.push(`目标价值缺口（${Math.round(gap / 10000)}万）远超现有系统现值（${Math.round(vKnown / 10000)}万）的 1.5 倍`)
  } else if (gapRatio > 0.5) {
    severityScore += 1
    reasons.push(`存在 ${Math.round(gap / 10000)} 万元的实质性价值缺口`)
  }

  if (extraLaborRatio > 0.8) {
    severityScore += 2
    reasons.push(`职场路径需要每年增加现有收入的 ${Math.round(extraLaborRatio * 100)}%，收入跃升跨度极大`)
  } else if (extraLaborRatio > 0.3) {
    severityScore += 1
    reasons.push(`职场路径需要现有净收入提升约 ${Math.round(extraLaborRatio * 100)}%`)
  }

  // 检查是否勾选了现实检验
  const check = profile.targetGoal?.realityCheck || {}
  const untickedCount = [
    Boolean(check.hasCustomerBase),
    Boolean(check.hasTimeCapital || check.canAffordReinvestment),
    Boolean(check.toleratesZeroGrowth || check.zeroGrowthTested),
    Boolean(check.hasDownsideBuffer || check.delayTolerance)
  ].filter(val => !val).length

  if (untickedCount >= 3) {
    severityScore += 1
    reasons.push('现实商业基础、精力再投资与下行缓冲尚未充分验证')
  } else if (untickedCount === 0) {
    reasons.push('4项现实条件均已完成检验，具备扎实的落地抓手')
  }

  if (severityScore >= 3) {
    return {
      level: 'high',
      badge: '🔴 高度苛刻 / 极度依赖终值',
      color: '#c2410c',
      title: '目标对现实假设极为苛刻',
      reasons,
      advice: '建议适度下调阶段性目标，或考虑多工作 3–5 年，避免过早透支当期生活质量。'
    }
  }

  if (severityScore >= 1) {
    return {
      level: 'medium',
      badge: '🟡 条件较苛刻 / 需扎实执行',
      color: '#d97706',
      title: '具备实现可能，但需明确兑现路径',
      reasons,
      advice: '建议重点验证持续收入的合同基础，或在日常生活开销中建立刚性储蓄规则。'
    }
  }

  return {
    level: 'low',
    badge: '🟢 相对从容 / 安全边际充裕',
    color: '#0d6b53',
    title: '目标处于可控射程范围内',
    reasons: reasons.length > 0 ? reasons : ['缺口适中，依靠职场适度进阶或固定储蓄即可平稳填补。'],
    advice: '保持当前稳健节奏，按既定储蓄或副业实验推进即可。'
  }
}

module.exports = {
  DEFAULT_DISCOUNT_RATE,
  DEFAULT_TERMINAL_GROWTH,
  DEFAULT_RECURRING_RETURN,
  DEFAULT_LIFE_EXPECTANCY,
  createDefaultWorkbenchProfile,
  validateDoubleCounting,
  calculateForwardDcf,
  calculateSensitivityMatrix,
  calculateReverseDcf,
  evaluateSeverity
}
