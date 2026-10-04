const storage = require('../../utils/storage')

Page({
  data: { hasDraft: false },
  onShow() {
    this.setData({ hasDraft: Boolean(storage.getDraft()) })
  },
  start() { wx.navigateTo({ url: '/pages/question/index?step=0' }) },
  continueDraft() { wx.navigateTo({ url: '/pages/question/index?step=0' }) },
  openRules() {
    wx.showModal({
      title: '它是怎么算的？',
      content: '我们用年龄段、收入区间、工作状态和已确认的短期变化，推演未来十年的税后职业收入情景。默认按今天购买力大致维持，不假设长期增长。它不计算资产、债务或家庭，也不衡量人的价值。',
      showCancel: false,
      confirmText: '我明白了'
    })
  },
  openSettings() { wx.navigateTo({ url: '/pages/settings/index' }) }
})
