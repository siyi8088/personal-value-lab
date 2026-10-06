const storage = require('../../utils/storage')

Page({
  data: {
    result: null,
    hasMoney: false,
    hasCliff: false,
    trialTargetWan: 200,
    trialGapWan: 120,
    trialMonthlySavings: 2800,
    trialSideIncomeWan: 4.2,
    isHookExpanded: false
  },

  toggleHookExpanded() {
    this.setData({ isHookExpanded: !this.data.isHookExpanded })
  },

  onShow() {
    const result = storage.getResult()
    if (!result) {
      wx.reLaunch({ url: '/pages/landing/index' })
      return
    }

    const hasMoney = Boolean(result.dcf && result.dcf.moneyAvailable)
    const hasCliff = Boolean(result.dcf && result.dcf.cliff && result.dcf.cliff.hasCliff)

    this.setData({
      result,
      hasMoney,
      hasCliff
    })

    const currentWan = result.dcf && result.dcf.totalPv ? Math.round(result.dcf.totalPv.mid / 10000) : 60
    const initialTarget = Math.max(150, Math.ceil((currentWan + 50) / 50) * 50)
    this.updateTrial(initialTarget, result)
  },

  updateTrial(trialTargetWan, result = this.data.result) {
    if (!result) return
    const currentWan = result.dcf && result.dcf.totalPv ? Math.round(result.dcf.totalPv.mid / 10000) : 60
    const gapWan = Math.max(0, trialTargetWan - currentWan)
    const workYears = Math.max(1, (result.expectedRetirementAge || 63) - (result.currentAge || 32))
    const monthlySavings = Math.round((gapWan * 10000) / (workYears * 12))
    const sideIncomeWan = Math.round(gapWan * 0.035 * 10) / 10

    this.setData({
      trialTargetWan,
      trialGapWan: gapWan,
      trialMonthlySavings: monthlySavings,
      trialSideIncomeWan: sideIncomeWan
    })
  },

  onTrialSlider(e) {
    const trialTargetWan = Number(e.detail.value)
    this.updateTrial(trialTargetWan)
  },

  openActions() {
    wx.navigateTo({ url: '/pages/actions/index' })
  },

  openShare() {
    wx.navigateTo({ url: '/pages/share-card/index' })
  },

  openWorkbench() {
    wx.navigateTo({ url: '/pages/workbench/index' })
  },

  edit() {
    wx.redirectTo({ url: '/pages/question/index?step=0' })
  },

  explain() {
    const result = this.data.result
    const content = result.explanations ? result.explanations.join('\n\n') : '基于现金流贴现模型（DCF）测算。'
    wx.showModal({
      title: '关于个人现金流 DCF 结构',
      content,
      showCancel: false,
      confirmText: '我明白了'
    })
  }
})
