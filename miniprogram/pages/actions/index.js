const storage = require('../../utils/storage')

Page({
  data: { actions: [], savedId: '' },
  onShow() {
    const result = storage.getResult()
    if (!result) { wx.reLaunch({ url: '/pages/landing/index' }); return }
    const saved = storage.getSavedAction()
    this.setData({ actions: result.actions, savedId: saved ? saved.id : '' })
  },
  save(event) {
    const action = event.currentTarget.dataset.action
    storage.saveAction(action)
    this.setData({ savedId: action.id })
    wx.showToast({ title: '已保存到本机', icon: 'success' })
  },
  backToResult() { wx.navigateBack() }
})
