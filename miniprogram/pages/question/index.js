const storage = require('../../utils/storage')
const engine = require('../../utils/quick-engine')

const QUESTIONS = [
  { key: 'ageBand', title: '你在哪个年龄阶段？', hint: '只用于理解职业阶段，不推断你的能力或人生选择。', options: [
    ['18_24', '18–24 岁'], ['25_29', '25–29 岁'], ['30_34', '30–34 岁'], ['35_39', '35–39 岁'], ['40_49', '40–49 岁'], ['50_plus', '50 岁以上']
  ] },
  { key: 'incomeBand', title: '目前每月到手收入大约是？', hint: '选择大概范围即可；不方便说也能继续。', options: [
    ['under_5k', '5 千以下'], ['5_8k', '5 千–8 千'], ['8_12k', '8 千–1.2 万'], ['12_20k', '1.2 万–2 万'], ['20_35k', '2 万–3.5 万'], ['35_50k', '3.5 万–5 万'], ['50_80k', '5 万–8 万'], ['80k_plus', '8 万以上'], ['undisclosed', '我不方便说']
  ] },
  { key: 'workType', title: '你目前的工作状态更接近？', hint: '这不是职业优劣判断，只帮助理解收入的波动方式。', options: [
    ['stable_employed', '稳定受雇'], ['employed_variable', '受雇 + 绩效'], ['project', '项目 / 自由职业'], ['business', '自营 / 创业'], ['transition', '正在转型 / 待业']
  ] },
  { key: 'nearTermSignal', title: '未来 12–18 个月，有没有已确认的收入变化？', hint: '只填写已发生、已谈定或有合同支持的变化；它只影响前两年。', options: [
    ['confirmed_up', '有正在兑现的上行信号'], ['no_confirmed_change', '暂无确定变化'], ['pressure', '已有明显压力或不稳定因素'], ['unclear', '还说不清']
  ] },
  { key: 'goal', title: '此刻最想改善什么？', hint: '可跳过；它只会影响你得到的行动建议。', optional: true, options: [
    ['raise', '涨薪'], ['career_change', '转行'], ['stability', '稳定收入'], ['learn', '学习技能'], ['save', '开始储蓄'], ['none', '暂时没有']
  ] }
]

Page({
  data: { step: 0, total: QUESTIONS.length, question: null, answer: '', canContinue: false },
  onLoad(options) {
    const requested = Number(options.step || 0)
    this.profile = Object.assign({ schemaVersion: 1 }, storage.getDraft() || {})
    // Preserve an in-progress draft created before the short-term-signal update.
    if (!this.profile.nearTermSignal && this.profile.outlook) {
      const legacySignal = { up: 'confirmed_up', steady: 'no_confirmed_change', uncertain: 'unclear' }
      this.profile.nearTermSignal = legacySignal[this.profile.outlook] || 'unclear'
      delete this.profile.outlook
      storage.saveDraft(this.profile)
    }
    this.loadStep(Math.max(0, Math.min(requested, QUESTIONS.length - 1)))
  },
  loadStep(step) {
    const question = QUESTIONS[step]
    this.setData({ step, question, answer: this.profile[question.key] || '', canContinue: Boolean(this.profile[question.key]) })
  },
  choose(event) {
    const value = event.currentTarget.dataset.value
    const key = this.data.question.key
    this.profile[key] = value
    storage.saveDraft(this.profile)
    this.setData({ answer: value, canContinue: true })
  },
  next() {
    if (!this.data.canContinue) return
    if (this.data.step < QUESTIONS.length - 1) {
      this.loadStep(this.data.step + 1)
      return
    }
    try {
      const result = engine.calculateQuick(this.profile)
      storage.saveDraft(this.profile)
      storage.saveResult(result)
      wx.redirectTo({ url: '/pages/result/index' })
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法生成结果', icon: 'none' })
    }
  },
  previous() {
    if (this.data.step === 0) { wx.navigateBack(); return }
    this.loadStep(this.data.step - 1)
  }
})
