const storage = require('../../utils/storage')

Page({
  data: { hasDraft: false },
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
    wx.showModal({
      title: '关于个人现金流 DCF 实验室',
      content: '我们将企业估值的 DCF 框架迁移至个人：\n1. 劳动收入是显性有限期现金流，随退休截止；\n2. 养老金属于退休后有限期年金现值，不计入 Gordon 永续终值；\n3. 严格终值仅在具备独立持续经营引擎时准入；\n4. 恪守防双计与保守折现纪律，绝不衡量人的身价。',
      showCancel: false,
      confirmText: '我明白了'
    })
  },
  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' })
  }
})
