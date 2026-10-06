const storage = require('../../utils/storage')

Page({
  data: {
    result: null,
    hasMoney: false,
    hasCliff: false,
    showRulesModal: false
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

  openWorkbenchWithReverse() {
    wx.navigateTo({ url: '/pages/workbench/index?tab=3' })
  },

  edit() {
    wx.redirectTo({ url: '/pages/question/index?step=0' })
  },

  explain() {
    this.setData({ showRulesModal: true })
  },

  closeRulesModal() {
    this.setData({ showRulesModal: false })
  },

  noop() {},

  copyArticleUrl(e) {
    const { url, name } = e.currentTarget.dataset
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: `已复制《${name}》`, icon: 'success' })
      }
    })
  }
})
