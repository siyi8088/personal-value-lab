const storage = require('../../utils/storage')

Page({
  data: {
    result: null,
    mainRatioText: '',
    isWorkingDominant: true,
    imagePath: '',
    imageReady: false
  },

  onShow() {
    const result = storage.getResult()
    if (!result) {
      wx.reLaunch({ url: '/pages/landing/index' })
      return
    }

    const isWorkingDominant = result.persona && result.persona.dominantPillar === 'working'
    const mainRatioText = isWorkingDominant
      ? `${result.dcf.ratios.workingRatio}%`
      : `${result.dcf.ratios.postWorkTotalRatio}%`

    this.setData({
      result,
      mainRatioText,
      isWorkingDominant
    })
  },

  onReady() {
    this.drawCard()
  },

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

      const result = this.data.result
      const persona = result.persona || {}
      const isWorkingDominant = this.data.isWorkingDominant

      // 1. 深绿底色与背景渐变
      context.fillStyle = '#173f36'
      context.fillRect(0, 0, width, height)

      // 2. 装饰光晕与轨道线
      context.fillStyle = '#266757'
      context.beginPath()
      context.arc(680, 230, 360, 0, Math.PI * 2)
      context.fill()

      context.strokeStyle = 'rgba(228, 246, 229, 0.22)'
      context.lineWidth = 3
      ;[[330, 330, 420, 160], [560, 580, 490, 210], [160, 730, 390, 150]].forEach(([x, y, w, h]) => {
        context.beginPath()
        context.ellipse(x, y, w, h, -0.45, 0, Math.PI * 2)
        context.stroke()
      })

      // 3. 顶部品牌
      context.fillStyle = '#d7eee3'
      context.font = '28px sans-serif'
      context.fillText('个人现金流 DCF 实验室', 70, 95)

      // 4. 人设标签胶囊
      context.fillStyle = '#39826f'
      context.beginPath()
      context.roundRect(70, 550, 420, 60, 14)
      context.fill()

      context.fillStyle = '#ffffff'
      context.font = 'bold 30px sans-serif'
      context.fillText(persona.badge || '个人现金流系统', 90, 592)

      // 5. 主指标标头与大字
      context.fillStyle = '#a9d4c1'
      context.font = '30px sans-serif'
      const labelText = isWorkingDominant ? '工作期现值占比 (肉身打卡)' : '退休后现金流占比'
      context.fillText(labelText, 70, 665)

      const ratioNum = isWorkingDominant
        ? result.dcf.ratios.workingRatio
        : result.dcf.ratios.postWorkTotalRatio
      context.fillStyle = '#52e3b6'
      context.font = 'bold 112px sans-serif'
      context.fillText(`${ratioNum}%`, 70, 780)

      // 6. 金句与副标
      context.fillStyle = '#ffffff'
      context.font = 'bold 34px sans-serif'
      context.fillText(persona.punchline || '“不上班就断电，好在目前马力正足。”', 70, 860)

      context.fillStyle = '#b7d8cb'
      context.font = '26px sans-serif'
      context.fillText(persona.sub || '不衡量人的身价 · 看系统能走多远', 70, 915)

      // 7. 分割线
      context.strokeStyle = 'rgba(255, 255, 255, 0.16)'
      context.lineWidth = 1.5
      context.beginPath()
      context.moveTo(70, 960)
      context.lineTo(680, 960)
      context.stroke()

      // 8. 底部扫码引导文案
      context.fillStyle = '#e8f5ef'
      context.font = 'bold 28px sans-serif'
      context.fillText('长按识别小程序码', 70, 1025)

      context.fillStyle = '#9fc7b6'
      context.font = '23px sans-serif'
      context.fillText('测测你的现金流系统能走多远', 70, 1070)

      context.fillStyle = '#6e9684'
      context.font = '20px sans-serif'
      context.fillText('本地运算 · 零隐私收集 · 恪守 DCF 纪律', 70, 1115)

      // 9. 右下角二维码卡片
      const qrBoxX = 520
      const qrBoxY = 980
      const qrBoxSize = 160

      context.fillStyle = '#ffffff'
      context.beginPath()
      context.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 20)
      context.fill()

      const finishExport = () => {
        wx.canvasToTempFilePath({
          canvas,
          width,
          height,
          destWidth: width * 2,
          destHeight: height * 2,
          success: (file) => this.setData({ imagePath: file.tempFilePath, imageReady: true }),
          fail: () => this.setData({ imageReady: false })
        })
      }

      // 加载小程序码图片
      const qrImg = canvas.createImage()
      qrImg.onload = () => {
        context.drawImage(qrImg, qrBoxX + 10, qrBoxY + 10, qrBoxSize - 20, qrBoxSize - 20)
        finishExport()
      }
      qrImg.onerror = () => {
        // 优雅兜底绘制圆形小程序码徽标
        const cx = qrBoxX + qrBoxSize / 2
        const cy = qrBoxY + qrBoxSize / 2
        context.fillStyle = '#eaf3ee'
        context.beginPath()
        context.arc(cx, cy, qrBoxSize / 2 - 12, 0, Math.PI * 2)
        context.fill()
        context.strokeStyle = '#173f36'
        context.lineWidth = 3
        context.stroke()
        context.fillStyle = '#173f36'
        context.font = 'bold 24px sans-serif'
        context.textAlign = 'center'
        context.fillText('DCF 码', cx, cy + 8)
        context.textAlign = 'left'
        finishExport()
      }
      qrImg.src = '/assets/qrcode.png'
    })
  },

  onShareAppMessage() {
    const result = this.data.result
    const persona = result && result.persona ? result.persona.badge : '现金流人设'
    return {
      title: `我测了我的收入系统：我是【${persona}】`,
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
      fail: () => wx.showModal({
        title: '未能保存',
        content: '请允许保存图片到相册，或直接使用右上角转发。',
        showCancel: false,
        confirmText: '知道了'
      })
    })
  }
})
