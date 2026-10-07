const storage = require('../../utils/storage')
const {
  createDefaultWorkbenchProfile,
  calculateForwardDcf,
  calculateSensitivityMatrix,
  calculateReverseDcf
} = require('../../utils/workbench-engine')

function formatWan(num) {
  if (num === null || num === undefined) return '--'
  const val = Math.round(num / 10000)
  return `${val} 万`
}

function formatRate(rate) {
  const pct = Math.round(Number(rate) * 10000) / 100
  return Number.isInteger(pct) ? `${pct}.0%` : `${pct}%`
}

Page({
  data: {
    activeTab: 0,
    profile: null,
    forwardResult: null,
    sensitivityResult: null,
    reverseResult: null,
    diagnosisInfo: null,
    displayPcsv: '',
    displayDiscountRate: '3.5%',
    displayGrowthRate: '1.0%',
    discountRateSlider: 35,
    terminalGrowthRateSlider: 100,
    targetValueWan: 300,
    isPathsExpanded: false,

    // 收入流弹窗
    showAddStreamModal: false,
    isEditingStream: false,
    editingStreamId: '',
    newStream: {
      name: '',
      kind: 'side_job',
      annualAmount: 30000,
      startAge: 32,
      endAge: 63,
      maintenanceCost: 2000,
      supportsTerminalValue: false
    },
    streamKinds: [
      { id: 'labor', label: '主要职业', defaultName: '主要受雇薪资', isTv: false },
      { id: 'side_job', label: '副业/顾问', defaultName: '副业项目咨询', isTv: false },
      { id: 'business', label: '实体自营', defaultName: '自营业务分红', isTv: true },
      { id: 'rental', label: '出租物业', defaultName: '出租物业净租金', isTv: true },
      { id: 'royalty', label: '独立版权', defaultName: '独立版权/数字订阅', isTv: true }
    ],

    // 刚性支出弹窗
    showExpenseModal: false,
    isEditingExpense: false,
    editingExpenseId: '',
    expenseForm: {
      name: '商品房房贷月供',
      category: 'mortgage',
      annualAmount: 36000,
      startAge: 32,
      endAge: 52
    },
    expenseCategories: [
      { id: 'mortgage', label: '房贷月供', defaultName: '商品房房贷月供' },
      { id: 'living', label: '基本生活', defaultName: '日常刚性基本生活费' },
      { id: 'family', label: '家庭教育/赡养', defaultName: '子女教育与赡养支出' },
      { id: 'other', label: '其他固定年费', defaultName: '商业保险与年费支出' }
    ],

    // 存量资产弹窗
    showAssetModal: false,
    isEditingAsset: false,
    editingAssetId: '',
    assetForm: {
      name: '流动资金与定存',
      category: 'cash_deposit',
      conservativeValue: 80000,
      valuationMethod: 'nav'
    },

    // 自定义说明弹窗（轻量版同款）
    showExplanationModal: false,
    explanationTitle: '',
    explanationLead: '',
    explanationItems: [],

    // 目标现值自定义弹窗
    showTargetModal: false,
    targetInputWan: '',
    hasTvEngine: false,
    showTvActivatedBanner: false,
    lastAddedTvName: '',

    // 假设实验室标尺刻度与折叠状态
    showConceptIntro: false,
    rTicks: [
      { label: '2%', val: 20, isMajor: true },
      { label: '', val: 25, isMajor: false },
      { label: '3%', val: 30, isMajor: true },
      { label: '', val: 35, isMajor: false },
      { label: '4%', val: 40, isMajor: true },
      { label: '', val: 45, isMajor: false },
      { label: '5%', val: 50, isMajor: true },
      { label: '', val: 55, isMajor: false },
      { label: '6%', val: 60, isMajor: true },
      { label: '', val: 65, isMajor: false },
      { label: '7%', val: 70, isMajor: true }
    ],
    gTicks: [
      { label: '0%', val: 0, isMajor: true },
      { label: '', val: 25, isMajor: false },
      { label: '0.5%', val: 50, isMajor: true },
      { label: '', val: 75, isMajor: false },
      { label: '1.0%', val: 100, isMajor: true },
      { label: '', val: 125, isMajor: false },
      { label: '1.5%', val: 150, isMajor: true },
      { label: '', val: 175, isMajor: false },
      { label: '2.0%', val: 200, isMajor: true },
      { label: '', val: 225, isMajor: false },
      { label: '2.5%', val: 250, isMajor: true }
    ]
  },

  onLoad(query) {
    if (query && query.tab !== undefined) {
      this.setData({ activeTab: Number(query.tab) })
    }
    this.initProfile()
  },

  initProfile() {
    let profile = storage.getWorkbenchProfile()
    const quickDraft = storage.getDraft() || {}
    if (!profile) {
      profile = createDefaultWorkbenchProfile({}, quickDraft)
      storage.saveWorkbenchProfile(profile)
    }

    const targetValueWan = Math.round((profile.targetGoal?.targetPcsv || 3000000) / 10000)
    const discountRate = Number(profile.discountRate || 0.035)
    const terminalGrowthRate = Number(profile.terminalGrowthRate || 0.01)

    this.setData({
      profile,
      targetValueWan,
      displayDiscountRate: formatRate(discountRate),
      displayGrowthRate: formatRate(terminalGrowthRate),
      discountRateSlider: Math.round(discountRate * 1000),
      terminalGrowthRateSlider: Math.round(terminalGrowthRate * 10000)
    })
    this.recalculateAll(profile)
  },

  recalculateAll(profile) {
    try {
      const forwardResult = calculateForwardDcf(profile)
      const sensitivityResult = calculateSensitivityMatrix(profile)
      const targetPcsv = (this.data.targetValueWan || 300) * 10000
      const reverseResult = calculateReverseDcf(profile, targetPcsv)

      const discountRate = Number(profile.discountRate || 0.035)
      const terminalGrowthRate = Number(profile.terminalGrowthRate || 0.01)

      // 判断是否有生效的独立持续造血流
      const hasTvEngine = (profile.incomeStreams || []).some(
        s => s.supportsTerminalValue && Number(s.annualAmount) > 0
      )

      // 生成智能诊断结论
      const diagnosisInfo = this.buildDiagnosis(profile, forwardResult)

      this.setData({
        forwardResult,
        sensitivityResult,
        reverseResult,
        diagnosisInfo,
        hasTvEngine,
        displayPcsv: formatWan(forwardResult.totalPcsv),
        displayDiscountRate: formatRate(discountRate),
        displayGrowthRate: formatRate(terminalGrowthRate),
        discountRateSlider: Math.round(discountRate * 1000),
        terminalGrowthRateSlider: Math.round(terminalGrowthRate * 10000)
      })
    } catch (err) {
      wx.showToast({ title: err.message || '计算出错', icon: 'none' })
    }
  },

  buildDiagnosis(profile, forward) {
    const hasCliff = (profile.incomeStreams || []).some(
      s => s.kind === 'labor' && s.endAge < profile.expectedRetirementAge
    )
    if (hasCliff) {
      return {
        level: 'warning',
        badge: '⚠️ 面临失业断崖风险',
        text: '因受职业中断假设影响，劳动现金流被截断在未来 5 年内，与法定退休之间出现漫长的收入真空期。系统总体折现现值受到显著压制，抵御家庭刚性支出的安全边际偏低。建议尽早建立流动性储备底仓，并在底表中试算第二收入曲线对断崖期的缓冲效果。'
      }
    }
    if (forward.ratios.strictTvRatio > 0) {
      return {
        level: 'success',
        badge: '🌱 拥有独立造血引擎',
        text: `你的现金流系统已具备脱离肉身打卡的独立造血能力，终值现值约 ${forward.strictTvWan} 万元（占比 ${forward.ratios.strictTvRatio}%），这是跨越周期、抵御通胀的核心支柱。终值估值对增长率(g)与折现率(r)极度敏感，建议在底表中严谨核验业务维系成本与分红确定性，警惕过度乐观。`
      }
    }
    if (forward.ratios.workingRatio >= 70) {
      return {
        level: 'info',
        badge: '🏢 高度依赖肉身打卡',
        text: `系统总现值的 ${forward.ratios.workingRatio}% 完全依托于在职劳动收入，资产与终值造血几乎空白，抗风险结构呈典型的“单引擎承重”。一旦遭遇行业周期收缩或职业中断，现金流将失去主要动能。建议在稳定主业的同时，逐步将工作期净结余转化为生息资产或探索轻量级自营分红。`
      }
    }
    return {
      level: 'normal',
      badge: '⚖️ 多元现金流结构',
      text: '系统现金流在职场劳动、年金兜底与资产储备间分布相对平稳，具备较好的抗周期韧性。可进一步通过底表核对各项刚性支出的起止期限，并在假设实验室中评估折现率变动对各项远期现金流的差异化影响。'
    }
  },

  switchTab(e) {
    const tab = Number(e.currentTarget.dataset.tab)
    this.setData({ activeTab: tab })
  },

  goToSheetTab() {
    this.setData({ activeTab: 1 })
  },

  goToLabTab() {
    this.setData({ activeTab: 2 })
  },

  goToAddTvStream() {
    const currentAge = this.data.profile.currentAge || 32
    this.setData({
      showAddStreamModal: true,
      isEditingStream: false,
      editingStreamId: '',
      newStream: {
        name: '自营分红/造血业务',
        kind: 'business',
        annualAmount: 50000,
        startAge: currentAge,
        endAge: 82,
        maintenanceCost: 3000,
        supportsTerminalValue: true
      }
    })
  },

  dismissTvActivatedBanner() {
    this.setData({ showTvActivatedBanner: false })
  },


  toggleBasis(e) {
    const basis = e.currentTarget.dataset.basis
    const profile = { ...this.data.profile, basis }
    this.updateProfile(profile)
  },

  onRateChange(e) {
    const field = e.currentTarget.dataset.field
    const rawVal = Number(e.detail.value)
    let val
    if (field === 'terminalGrowthRate') {
      val = Number((rawVal / 10000).toFixed(4))
    } else {
      val = Number((rawVal / 1000).toFixed(4))
    }
    const profile = { ...this.data.profile, [field]: val }
    this.updateProfile(profile)
  },

  onSelectTick(e) {
    const field = e.currentTarget.dataset.field
    const rawVal = Number(e.currentTarget.dataset.val)
    let val
    if (field === 'terminalGrowthRate') {
      val = Number((rawVal / 10000).toFixed(4))
    } else {
      val = Number((rawVal / 1000).toFixed(4))
    }
    const profile = { ...this.data.profile, [field]: val }
    this.updateProfile(profile)
  },

  toggleConceptIntro() {
    this.setData({ showConceptIntro: !this.data.showConceptIntro })
  },

  onTargetSlider(e) {
    const targetValueWan = Number(e.detail.value)
    this.setData({ targetValueWan })
    const profile = {
      ...this.data.profile,
      targetGoal: {
        ...(this.data.profile.targetGoal || {}),
        targetPcsv: targetValueWan * 10000
      }
    }
    this.updateProfile(profile)
  },

  // 目标现值自定义输入弹窗
  openTargetInputModal() {
    this.setData({
      showTargetModal: true,
      targetInputWan: String(this.data.targetValueWan)
    })
  },

  closeTargetModal() {
    this.setData({ showTargetModal: false })
  },

  onTargetInputChange(e) {
    this.setData({ targetInputWan: e.detail.value })
  },

  selectTargetQuick(e) {
    const val = e.currentTarget.dataset.val
    this.setData({ targetInputWan: String(val) })
  },

  confirmTargetInput() {
    const val = Number(this.data.targetInputWan)
    if (isNaN(val) || val <= 0 || val > 10000) {
      wx.showToast({ title: '请输入合理的目标金额', icon: 'none' })
      return
    }
    const targetValueWan = Math.round(val)
    const profile = {
      ...this.data.profile,
      targetGoal: {
        ...(this.data.profile.targetGoal || {}),
        targetPcsv: targetValueWan * 10000
      }
    }
    this.setData({ showTargetModal: false, targetValueWan })
    this.updateProfile(profile)
  },

  toggleRealityCheck(e) {
    const key = e.currentTarget.dataset.key
    const current = this.data.profile.targetGoal?.realityCheck || {}
    const realityCheck = { ...current, [key]: !current[key] }
    const profile = {
      ...this.data.profile,
      targetGoal: {
        ...(this.data.profile.targetGoal || {}),
        realityCheck
      }
    }
    this.updateProfile(profile)
  },

  togglePathsExpanded() {
    this.setData({ isPathsExpanded: !this.data.isPathsExpanded })
  },

  // ================= 收入流管理 =================
  removeStream(e) {
    const id = e.currentTarget.dataset.id
    const incomeStreams = (this.data.profile.incomeStreams || []).filter(s => s.id !== id)
    if (incomeStreams.length === 0) {
      wx.showToast({ title: '至少保留一项收入流', icon: 'none' })
      return
    }
    const profile = { ...this.data.profile, incomeStreams }
    this.updateProfile(profile)
  },

  openAddStreamModal() {
    const currentAge = this.data.profile.currentAge || 32
    const retireAge = this.data.profile.expectedRetirementAge || 63
    this.setData({
      showAddStreamModal: true,
      isEditingStream: false,
      editingStreamId: '',
      newStream: {
        name: '副业项目咨询',
        kind: 'side_job',
        annualAmount: 30000,
        startAge: currentAge,
        endAge: retireAge,
        maintenanceCost: 2000,
        supportsTerminalValue: false
      }
    })
  },

  openEditStreamModal(e) {
    const id = e.currentTarget.dataset.id
    const stream = (this.data.profile.incomeStreams || []).find(s => s.id === id)
    if (!stream) return
    this.setData({
      showAddStreamModal: true,
      isEditingStream: true,
      editingStreamId: id,
      newStream: { ...stream }
    })
  },

  closeAddStreamModal() {
    this.setData({ showAddStreamModal: false })
  },

  selectStreamKind(e) {
    const kind = e.currentTarget.dataset.kind
    const item = this.data.streamKinds.find(k => k.id === kind)
    if (!item) return

    const currentName = this.data.newStream.name
    const isDefaultName = this.data.streamKinds.some(k => k.defaultName === currentName) || !currentName

    let supportsTerminalValue = item.isTv
    if (kind === 'labor') {
      supportsTerminalValue = false
    }

    this.setData({
      newStream: {
        ...this.data.newStream,
        kind,
        name: isDefaultName ? item.defaultName : currentName,
        supportsTerminalValue
      }
    })
  },

  selectAmountQuick(e) {
    const val = Number(e.currentTarget.dataset.val)
    this.setData({
      newStream: { ...this.data.newStream, annualAmount: val }
    })
  },

  selectMaintenanceQuick(e) {
    const val = Number(e.currentTarget.dataset.val)
    this.setData({
      newStream: { ...this.data.newStream, maintenanceCost: val }
    })
  },

  selectEndAgeQuick(e) {
    const type = e.currentTarget.dataset.type
    const currentAge = this.data.profile.currentAge || 32
    const retireAge = this.data.profile.expectedRetirementAge || 63
    let endAge = retireAge
    if (type === 'retire') endAge = retireAge
    else if (type === 'life') endAge = 82
    else if (type === 'cliff') endAge = Math.min(currentAge + 5, 82)

    this.setData({
      newStream: { ...this.data.newStream, endAge }
    })
  },

  onTerminalSwitch(e) {
    if (this.data.newStream.kind === 'labor') return
    this.setData({
      newStream: { ...this.data.newStream, supportsTerminalValue: Boolean(e.detail.value) }
    })
  },

  showTvExplanation() {
    this.setData({
      showExplanationModal: true,
      explanationTitle: '脱离打卡独立造血 说明',
      explanationLead: '仅指脱离日常打卡出勤后，仍能独立运转并产生净现金流的资产系统：',
      explanationItems: [
        {
          title: '适合开启',
          desc: '自动化店铺分红、出租物业租金、自媒体长尾流量/图书版权/独立软件等被动收益。'
        },
        {
          title: '不适合开启',
          desc: '主要受雇工薪、按小时计费的咨询顾问、接单外包等（人停钱停依然属于有限期劳动）。'
        }
      ]
    })
  },

  closeExplanationModal() {
    this.setData({ showExplanationModal: false })
  },

  noop() {},

  onNewStreamInput(e) {
    const field = e.currentTarget.dataset.field
    let val = e.detail.value
    if (['annualAmount', 'startAge', 'endAge', 'maintenanceCost'].includes(field)) {
      val = Number(val) || 0
    }
    this.setData({
      newStream: { ...this.data.newStream, [field]: val }
    })
  },

  confirmAddStream() {
    const streamData = this.data.newStream
    if (!streamData.name || !streamData.name.trim()) {
      wx.showToast({ title: '请输入收入流名称', icon: 'none' })
      return
    }
    if (Number(streamData.annualAmount) <= 0) {
      wx.showToast({ title: '年收入需大于 0', icon: 'none' })
      return
    }

    let incomeStreams = [...(this.data.profile.incomeStreams || [])]
    if (this.data.isEditingStream && this.data.editingStreamId) {
      incomeStreams = incomeStreams.map(s => {
        if (s.id === this.data.editingStreamId) {
          return { ...streamData, id: this.data.editingStreamId }
        }
        return s
      })
    } else {
      const newEntry = {
        ...streamData,
        id: `stream_${Date.now()}`
      }
      incomeStreams.push(newEntry)
    }

    const hadNoTvEngine = !this.data.hasTvEngine
    const profile = { ...this.data.profile, incomeStreams }
    const isNowTv = Boolean(streamData.supportsTerminalValue) && hadNoTvEngine
    this.setData({
      showAddStreamModal: false,
      showTvActivatedBanner: isNowTv ? true : this.data.showTvActivatedBanner,
      lastAddedTvName: isNowTv ? (streamData.name || '造血资产') : (this.data.lastAddedTvName || '')
    })
    this.updateProfile(profile)
    // 假设实验室激活造血业务后已有原位 Banner 明确提示，无需弹出遮挡视线的 Toast
    if (!isNowTv) {
      wx.showToast({
        title: this.data.isEditingStream ? '已更新收入流' : '已添加收入流',
        icon: 'success'
      })
    }
  },

  // ================= 刚性支出管理 =================
  openAddExpenseModal() {
    const currentAge = this.data.profile.currentAge || 32
    this.setData({
      showExpenseModal: true,
      isEditingExpense: false,
      editingExpenseId: '',
      expenseForm: {
        name: '商品房房贷月供',
        category: 'mortgage',
        annualAmount: 36000,
        startAge: currentAge,
        endAge: Math.min(currentAge + 20, 82)
      }
    })
  },

  openEditExpenseModal(e) {
    const id = e.currentTarget.dataset.id
    const exp = (this.data.profile.expenses || []).find(item => item.id === id)
    if (!exp) return
    this.setData({
      showExpenseModal: true,
      isEditingExpense: true,
      editingExpenseId: id,
      expenseForm: { ...exp }
    })
  },

  closeExpenseModal() {
    this.setData({ showExpenseModal: false })
  },

  selectExpenseCategory(e) {
    const category = e.currentTarget.dataset.category
    const cat = this.data.expenseCategories.find(c => c.id === category)
    if (!cat) return

    const currentName = this.data.expenseForm.name
    const isDefaultName = this.data.expenseCategories.some(c => c.defaultName === currentName) || !currentName

    this.setData({
      expenseForm: {
        ...this.data.expenseForm,
        category,
        name: isDefaultName ? cat.defaultName : currentName
      }
    })
  },

  selectExpenseAmountQuick(e) {
    const val = Number(e.currentTarget.dataset.val)
    this.setData({
      expenseForm: { ...this.data.expenseForm, annualAmount: val }
    })
  },

  selectExpenseEndAgeQuick(e) {
    const type = e.currentTarget.dataset.type
    const currentAge = this.data.profile.currentAge || 32
    let endAge = 82
    if (type === '10yr') endAge = Math.min(currentAge + 10, 82)
    else if (type === '20yr') endAge = Math.min(currentAge + 20, 82)
    else if (type === 'life') endAge = 82

    this.setData({
      expenseForm: { ...this.data.expenseForm, endAge }
    })
  },

  onExpenseInput(e) {
    const field = e.currentTarget.dataset.field
    let val = e.detail.value
    if (['annualAmount', 'startAge', 'endAge'].includes(field)) {
      val = Number(val) || 0
    }
    this.setData({
      expenseForm: { ...this.data.expenseForm, [field]: val }
    })
  },

  confirmExpense() {
    const exp = this.data.expenseForm
    if (!exp.name || !exp.name.trim()) {
      wx.showToast({ title: '请输入支出项名称', icon: 'none' })
      return
    }
    if (Number(exp.annualAmount) <= 0) {
      wx.showToast({ title: '支出金额需大于 0', icon: 'none' })
      return
    }

    let expenses = [...(this.data.profile.expenses || [])]
    if (this.data.isEditingExpense && this.data.editingExpenseId) {
      expenses = expenses.map(item => {
        if (item.id === this.data.editingExpenseId) {
          return { ...exp, id: this.data.editingExpenseId }
        }
        return item
      })
    } else {
      expenses.push({
        ...exp,
        id: `exp_${Date.now()}`
      })
    }

    const profile = { ...this.data.profile, expenses }
    this.setData({ showExpenseModal: false })
    this.updateProfile(profile)
    wx.showToast({
      title: this.data.isEditingExpense ? '已更新支出项' : '已添加支出项',
      icon: 'success'
    })
  },

  removeExpense(e) {
    const id = e.currentTarget.dataset.id
    const expenses = (this.data.profile.expenses || []).filter(item => item.id !== id)
    const profile = { ...this.data.profile, expenses }
    this.updateProfile(profile)
    wx.showToast({ title: '已删除支出项', icon: 'none' })
  },

  // ================= 资产负债管理 =================
  openAddAssetModal() {
    this.setData({
      showAssetModal: true,
      isEditingAsset: false,
      editingAssetId: '',
      assetForm: {
        name: '流动资金 / 银行定存',
        category: 'cash_deposit',
        conservativeValue: 100000,
        valuationMethod: 'nav'
      }
    })
  },

  openEditAssetModal(e) {
    const id = e.currentTarget.dataset.id
    const asset = (this.data.profile.assets || []).find(item => item.id === id)
    if (!asset) return
    this.setData({
      showAssetModal: true,
      isEditingAsset: true,
      editingAssetId: id,
      assetForm: { ...asset }
    })
  },

  closeAssetModal() {
    this.setData({ showAssetModal: false })
  },

  selectAssetMethod(e) {
    const valuationMethod = e.currentTarget.dataset.method
    this.setData({
      assetForm: { ...this.data.assetForm, valuationMethod }
    })
  },

  selectAssetValQuick(e) {
    const val = Number(e.currentTarget.dataset.val)
    this.setData({
      assetForm: { ...this.data.assetForm, conservativeValue: val }
    })
  },

  onAssetInput(e) {
    const field = e.currentTarget.dataset.field
    let val = e.detail.value
    if (field === 'conservativeValue') {
      val = Number(val) || 0
    }
    this.setData({
      assetForm: { ...this.data.assetForm, [field]: val }
    })
  },

  confirmAsset() {
    const asset = this.data.assetForm
    if (!asset.name || !asset.name.trim()) {
      wx.showToast({ title: '请输入资产名称', icon: 'none' })
      return
    }
    if (Number(asset.conservativeValue) < 0) {
      wx.showToast({ title: '净值不能为负数', icon: 'none' })
      return
    }

    let assets = [...(this.data.profile.assets || [])]
    if (this.data.isEditingAsset && this.data.editingAssetId) {
      assets = assets.map(item => {
        if (item.id === this.data.editingAssetId) {
          return { ...asset, id: this.data.editingAssetId }
        }
        return item
      })
    } else {
      assets.push({
        ...asset,
        id: `asset_${Date.now()}`
      })
    }

    const profile = { ...this.data.profile, assets }
    this.setData({ showAssetModal: false })
    this.updateProfile(profile)
    wx.showToast({
      title: this.data.isEditingAsset ? '已更新资产' : '已添加资产',
      icon: 'success'
    })
  },

  removeAsset(e) {
    const id = e.currentTarget.dataset.id
    const assets = (this.data.profile.assets || []).filter(item => item.id !== id)
    const profile = { ...this.data.profile, assets }
    this.updateProfile(profile)
    wx.showToast({ title: '已删除资产', icon: 'none' })
  },

  showNavHelpModal() {
    wx.showModal({
      title: '防双重计价原则 (Anti-Double-Counting)',
      content: '估值核心原则是区分资产的计量口径：\n\n1. 资产法 (NAV)：按当前变现清算价值一次性计入总现值（如自住房、银行存单）。该资产未来产生的现金流绝不可再重复折现。\n\n2. 收益法 (DCF)：若一项资产（如出租物业、分红股权）已将其未来每年的租金或分红折现计入系统，则绝对不能再将资产本金市值加进净资产，否则同一笔财富会被计算两次！',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#173f36'
    })
  },

  updateProfile(profile) {
    this.setData({ profile })
    storage.saveWorkbenchProfile(profile)
    this.recalculateAll(profile)
  },

  resetAll() {
    wx.showModal({
      title: '重置工作台',
      content: '确定要将所有底表与假设恢复为默认初始状态吗？将重新沿用轻量版画像。',
      success: (res) => {
        if (res.confirm) {
          const quickDraft = storage.getDraft() || {}
          const profile = createDefaultWorkbenchProfile({}, quickDraft)
          this.updateProfile(profile)
          wx.showToast({ title: '已重置', icon: 'success' })
        }
      }
    })
  }
})
