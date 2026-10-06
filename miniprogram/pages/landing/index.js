const storage = require('../../utils/storage')

Page({
  data: {
    hasDraft: false,
    showRulesModal: false
  },
  onShow() {
    this.setData({ hasDraft: Boolean(storage.getDraft()) })
  },
  start() {
    wx.navigateTo({ url: '/pages/question/index?step=0' })
  },
  continueDraft() {
    wx.navigateTo({ url: '/pages/question/index?step=0' })
  },
  openRules() {
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
  },
  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' })
  }
})
