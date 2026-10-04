const storage = require('../../utils/storage')

Page({
  clearData() {
    wx.showModal({
      title: '删除本机数据？',
      content: '这会删除这台设备上的快速测回答、结果和已保存行动，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#b13e37',
      success: (response) => {
        if (!response.confirm) return
        storage.clearQuickData()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }
})
