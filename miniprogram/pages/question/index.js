const storage = require('../../utils/storage')
const engine = require('../../utils/quick-engine')
const { calculateStatutoryRetirement } = require('../../utils/retirement')

const AGE_BANDS = [
  { id: '18_24', label: '18–24 岁', midYear: 2004, age: 22 },
  { id: '25_29', label: '25–29 岁', midYear: 1999, age: 27 },
  { id: '30_34', label: '30–34 岁', midYear: 1994, age: 32 },
  { id: '35_39', label: '35–39 岁', midYear: 1989, age: 37 },
  { id: '40_49', label: '40–49 岁', midYear: 1981, age: 45 },
  { id: '50_plus', label: '50 岁以上', midYear: 1973, age: 53 }
]

const WORK_TYPES = [
  { id: 'stable_employed', label: '稳定受雇' },
  { id: 'employed_variable', label: '受雇 + 绩效' },
  { id: 'project', label: '自由职业 / 项目' },
  { id: 'business', label: '自营 / 创业' },
  { id: 'transition', label: '转型 / 待业' }
]

const INCOME_OPTIONS = [
  ['under_5k', '5 千以下'],
  ['5_8k', '5 千–8 千'],
  ['8_12k', '8 千–1.2 万'],
  ['12_20k', '1.2 万–2 万'],
  ['20_35k', '2 万–3.5 万'],
  ['35_50k', '3.5 万–5 万'],
  ['50_80k', '5 万–8 万'],
  ['80k_plus', '8 万以上'],
  ['undisclosed', '我不方便说']
]

const RISK_OPTIONS = [
  {
    id: 'upside',
    title: '稳中有升',
    desc: '业务处于扩张通道或近期有涨薪预期；前 3 年稳步递增，第 4 年起进入成熟平稳期'
  },
  {
    id: 'steady',
    title: '平稳维持',
    desc: '收入与当前购买力大体相当，不作激进增长预期，稳扎稳打按基线折现'
  },
  {
    id: 'downside',
    title: '行业承压',
    desc: '行业周期调整、年终奖缩水或降薪预期；前 3 年逐步回撤触底，第 4 年起在调整后基线企稳'
  },
  {
    id: 'unemployment_risk',
    title: '中断风险',
    badge: '断崖警示',
    desc: '受年龄或行业剧变影响较大；仅计入未来 5 年现金流，直观呈现后半程收入断崖'
  }
]

const PENSION_OPTIONS = [
  {
    id: 'average',
    title: '工薪平均（约 3,000 元/月）',
    desc: '贴合全国普通企业退休职工平均养老金水平'
  },
  {
    id: 'basic',
    title: '基础温饱（约 1,500 元/月）',
    desc: '城乡居保或灵活就业最低基数兜底保障'
  },
  {
    id: 'affluent',
    title: '较充裕 / 体制内（约 8,000 元/月）',
    desc: '机关事业单位、高工龄或含企业/职业年金'
  },
  {
    id: 'none',
    title: '暂不纳入模型（0 元）',
    desc: '观察完全不依赖法定养老金、纯靠自持能力时的现金流结构'
  }
]

const ENGINE_OPTIONS = [
  {
    id: 'none',
    title: '暂无持续收入引擎',
    desc: '绝大多数普通人的常态；严格终值占比为 0%'
  },
  {
    id: 'rental',
    title: '有稳定出租物业',
    desc: '停止日常工作后仍有持续租金净收益（已扣除折旧与空置）'
  },
  {
    id: 'business',
    title: '有自营业务 / 股权分红',
    desc: '业务已脱离日常打卡，能够独立持续产生分红'
  },
  {
    id: 'royalty',
    title: '有独立版权 / 订阅产品',
    desc: '持续产生现金流，且每年有明确的维护与更新机制'
  }
]

Page({
  data: {
    step: 0,
    totalSteps: 5,
    gender: 'male',
    ageBand: '30_34',
    statutoryAge: 63,
    statutoryText: '63 岁',
    retirementPlan: 'statutory',
    expectedRetirementAge: 63,
    incomeBand: '8_12k',
    workType: 'stable_employed',
    careerRisk: 'steady',
    pensionTier: 'average',
    hasRecurringEngine: 'none',
    engineAnnualNetCashFlow: 30000,
    canContinue: true,
    ageBands: AGE_BANDS,
    workTypes: WORK_TYPES,
    incomeOptions: INCOME_OPTIONS,
    riskOptions: RISK_OPTIONS,
    pensionOptions: PENSION_OPTIONS,
    engineOptions: ENGINE_OPTIONS
  },

  onLoad(options) {
    const draft = storage.getDraft() || {}
    const requested = Number(options.step || 0)

    const gender = draft.gender || 'male'
    const ageBand = draft.ageBand || '30_34'
    const incomeBand = draft.incomeBand || '8_12k'
    const workType = draft.workType || 'stable_employed'
    const careerRisk = draft.careerRisk || (draft.nearTermSignal === 'confirmed_up' ? 'upside' : (draft.nearTermSignal === 'pressure' ? 'downside' : 'steady'))
    const pensionTier = draft.pensionTier || 'average'
    const hasRecurringEngine = draft.hasRecurringEngine || 'none'
    const engineAnnualNetCashFlow = draft.engineAnnualNetCashFlow || 30000

    this.setData({
      gender,
      ageBand,
      incomeBand,
      workType,
      careerRisk,
      pensionTier,
      hasRecurringEngine,
      engineAnnualNetCashFlow
    })

    this.recomputeStatutory(gender, ageBand)
    this.setData({ step: Math.max(0, Math.min(requested, 4)) })
  },

  recomputeStatutory(gender, ageBand) {
    const band = AGE_BANDS.find(b => b.id === ageBand) || AGE_BANDS[2]
    const info = calculateStatutoryRetirement(band.midYear, 6, gender)
    const statutoryAge = info.statutoryAgeRounded
    let expected = statutoryAge
    if (this.data.retirementPlan === 'fire') {
      expected = 50
    } else if (this.data.retirementPlan === 'extended') {
      expected = statutoryAge + 5
    }

    this.setData({
      statutoryAge,
      statutoryText: info.ageText,
      expectedRetirementAge: expected
    })
  },

  chooseGender(e) {
    const gender = e.currentTarget.dataset.value
    this.setData({ gender })
    this.recomputeStatutory(gender, this.data.ageBand)
    this.syncDraft()
  },

  chooseAgeBand(e) {
    const ageBand = e.currentTarget.dataset.value
    this.setData({ ageBand })
    this.recomputeStatutory(this.data.gender, ageBand)
    this.syncDraft()
  },

  chooseRetirementPlan(e) {
    const plan = e.currentTarget.dataset.value
    let expected = this.data.statutoryAge
    if (plan === 'fire') expected = 50
    if (plan === 'extended') expected = this.data.statutoryAge + 5
    this.setData({ retirementPlan: plan, expectedRetirementAge: expected })
    this.syncDraft()
  },

  chooseIncome(e) {
    const incomeBand = e.currentTarget.dataset.value
    this.setData({ incomeBand })
    this.syncDraft()
  },

  chooseWorkType(e) {
    const workType = e.currentTarget.dataset.value
    this.setData({ workType })
    this.syncDraft()
  },

  chooseRisk(e) {
    const careerRisk = e.currentTarget.dataset.value
    this.setData({ careerRisk })
    this.syncDraft()
  },

  choosePension(e) {
    const pensionTier = e.currentTarget.dataset.value
    this.setData({ pensionTier })
    this.syncDraft()
  },

  chooseEngine(e) {
    const hasRecurringEngine = e.currentTarget.dataset.value
    this.setData({ hasRecurringEngine })
    this.syncDraft()
  },

  chooseEngineAmount(e) {
    const amount = Number(e.currentTarget.dataset.value)
    this.setData({ engineAnnualNetCashFlow: amount })
    this.syncDraft()
  },

  syncDraft() {
    const profile = {
      schemaVersion: 2,
      gender: this.data.gender,
      ageBand: this.data.ageBand,
      expectedRetirementAge: this.data.expectedRetirementAge,
      statutoryRetirementAge: this.data.statutoryAge,
      incomeBand: this.data.incomeBand,
      workType: this.data.workType,
      careerRisk: this.data.careerRisk,
      pensionTier: this.data.pensionTier,
      hasRecurringEngine: this.data.hasRecurringEngine,
      engineAnnualNetCashFlow: this.data.engineAnnualNetCashFlow,
      engineMaintainedAfterRetire: this.data.hasRecurringEngine !== 'none'
    }
    storage.saveDraft(profile)
    return profile
  },

  next() {
    if (this.data.step < this.data.totalSteps - 1) {
      this.setData({ step: this.data.step + 1 })
      return
    }

    try {
      const profile = this.syncDraft()
      const result = engine.calculateQuick(profile)
      storage.saveResult(result)
      wx.redirectTo({ url: '/pages/result/index' })
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法生成结果', icon: 'none' })
    }
  },

  previous() {
    if (this.data.step === 0) {
      wx.navigateBack()
      return
    }
    this.setData({ step: this.data.step - 1 })
  }
})
