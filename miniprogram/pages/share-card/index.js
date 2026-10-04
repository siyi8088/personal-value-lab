const storage = require('../../utils/storage')

Page({
  data: { result: null, declaration: '', imagePath: '', imageReady: false },
  onShow() {
    const result = storage.getResult()
    if (!result) { wx.reLaunch({ url: '/pages/landing/index' }); return }
    const declaration = result.actions[0] ? `我准备先：${result.actions[0].title}` : '我正在看见自己的下一步'
    this.setData({ result, declaration })
  },
  onReady() { this.drawCard() },
  drawCard() {
    const query = wx.createSelectorQuery()
    query.select('#shareCanvas').fields({ node: true, size: true }).exec((nodes) => {
      const canvasInfo = nodes && nodes[0]
      if (!canvasInfo || !canvasInfo.node) return
      const canvas = canvasInfo.node
      const context = canvas.getContext('2d')
      const pixelRatio = wx.getSystemInfoSync().pixelRatio || 1
      const width = 750
      const height = 1200
      canvas.width = width * pixelRatio
      canvas.height = height * pixelRatio
      context.scale(pixelRatio, pixelRatio)

      context.fillStyle = '#1b5146'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#2b7969'
      context.beginPath()
      context.arc(680, 230, 340, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = 'rgba(228,246,229,0.32)'
      context.lineWidth = 3
      ;[[330, 330, 420, 160], [560, 580, 490, 210], [160, 730, 390, 150]].forEach(([x, y, w, h]) => {
        context.beginPath()
        context.ellipse(x, y, w, h, -0.45, 0, Math.PI * 2)
        context.stroke()
      })
      context.fillStyle = '#d7eee3'
      context.font = '28px sans-serif'
      context.fillText('未来收入地图', 70, 98)
      context.fillStyle = '#c8e3d7'
      context.font = '30px sans-serif'
      context.fillText('我的收入路径', 70, 725)
      context.fillStyle = '#ffffff'
      context.font = 'bold 70px sans-serif'
      context.fillText(this.data.result.trajectory.title, 70, 825)
      context.font = '34px sans-serif'
      context.fillText(this.data.declaration, 70, 900)
      context.fillStyle = '#c8e3d7'
      context.font = '27px sans-serif'
      context.fillText('3 分钟，看见未来收入的可能性', 70, 1110)

      wx.canvasToTempFilePath({
        canvas,
        width,
        height,
        destWidth: width * 2,
        destHeight: height * 2,
        success: (file) => this.setData({ imagePath: file.tempFilePath, imageReady: true }),
        fail: () => this.setData({ imageReady: false })
      })
    })
  },
  onShareAppMessage() {
    return {
      title: '我完成了一次未来收入地图',
      path: '/pages/landing/index',
      imageUrl: this.data.imagePath || undefined
    }
  },
  saveImage() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '分享卡正在生成，请稍后重试', icon: 'none' })
      return
    }
    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: () => wx.showModal({ title: '未能保存', content: '请允许保存图片到相册，或直接使用右上角发送给朋友。', showCancel: false, confirmText: '知道了' })
    })
  }
})
