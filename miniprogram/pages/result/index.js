const storage = require('../../utils/storage')

Page({
  data: { result: null, hasIncome: false },
  onShow() {
    const result = storage.getResult()
    if (!result) { wx.reLaunch({ url: '/pages/landing/index' }); return }
    this.setData({ result, hasIncome: Boolean(result.tenYearIncome) })
  },
  openActions() { wx.navigateTo({ url: '/pages/actions/index' }) },
  openShare() { wx.navigateTo({ url: '/pages/share-card/index' }) },
  edit() { wx.redirectTo({ url: '/pages/question/index?step=0' }) },
  explain() {
    const result = this.data.result
    wx.showModal({ title: '关于这份地图', content: result.explanations.join('\n\n'), showCancel: false, confirmText: '我明白了' })
  },
  upgrade() {
    wx.showModal({ title: '财务实验室即将开放', content: '完整版本会在你主动登录并选择保存后，才补充支出、储蓄、房贷等信息，帮你看安全垫和选择空间。V1 不会要求你上传这些数据。', showCancel: false, confirmText: '知道了' })
  }
})
