/**
 * 结算卡片合成器
 * 技术方案 §3.2
 *
 * 合成流程：
 * 1. 取本局最高楼层对应城市背景图
 * 2. Canvas 叠加：背景图 → 渐变蒙层 → 楼高/分数/连击/百分位文字 → 徽章
 * 3. 免费版：叠加水印，导出 720p
 * 4. 付费版：无水印，导出 2K
 */

import { generateBackground } from './api'

const FREE_WIDTH = 720
const PREMIUM_WIDTH = 2048

export class AICardGenerator {
  constructor() {
    this.freeCard = null     // Base64 / dataURL
    this.premiumCard = null  // Base64 / dataURL（等待 AI 生成）
    this._generating = false
  }

  /**
   * 开始生成卡片（游戏快结束时异步调用）
   * @param {object} stats - { floor, score, perfectCombo }
   * @param {HTMLImageElement} bgImg - 当前最高层背景图
   * @param {object} config - AI 配置
   */
  async generate(stats, bgImg, config = {}) {
    if (this._generating) return
    this._generating = true
    this.freeCard = null
    this.premiumCard = null

    try {
      // 免费版立即合成（本地，不调 AI）
      this.freeCard = await this._compose(bgImg, stats, {
        watermark: true,
        resolution: FREE_WIDTH,
      })

      // 付费版异步请求 AI 专属背景
      const theme = this._getTheme(stats.floor)
      try {
        const premiumBg = await generateBackground(theme, config)
        this.premiumCard = await this._compose(premiumBg, stats, {
          watermark: false,
          resolution: PREMIUM_WIDTH,
        })
      } catch (err) {
        console.warn('[Card] 付费版 AI 背景生成失败，回退到通用背景', err)
        this.premiumCard = await this._compose(bgImg, stats, {
          watermark: false,
          resolution: PREMIUM_WIDTH,
        })
      }
    } catch (err) {
      console.error('[Card] 卡片生成失败：', err)
      // 兜底：纯文字卡片
      this.freeCard = this._composeFallback(stats, { watermark: true })
      this.premiumCard = this._composeFallback(stats, { watermark: false })
    } finally {
      this._generating = false
    }
  }

  /**
   * 合成卡片（Canvas）
   */
  async _compose(bgImg, stats, { watermark, resolution }) {
    const W = resolution
    const H = Math.round(W * 1.6)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    // 1. 背景图
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, W, H)
    } else {
      ctx.fillStyle = '#1A237E'
      ctx.fillRect(0, 0, W, H)
    }

    // 2. 渐变蒙层（下半部分遮罩，让文字更清晰）
    const grad = ctx.createLinearGradient(0, H * 0.3, 0, H)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.5, 'rgba(0,0,0,0.55)')
    grad.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // 3. 文字内容
    const scale = W / 720
    this._drawCardText(ctx, stats, W, H, scale)

    // 4. 徽章（连击 ≥ 5 显示金色星星）
    if (stats.perfectCombo >= 5) {
      this._drawBadge(ctx, W, H, scale, stats.perfectCombo)
    }

    // 5. 水印
    if (watermark) {
      this._drawWatermark(ctx, W, H, scale)
    }

    return canvas.toDataURL('image/png')
  }

  _drawCardText(ctx, stats, W, H, scale) {
    const { floor, score, perfectCombo } = stats

    // 游戏标题
    ctx.save()
    ctx.font = `bold ${36 * scale}px Arial, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('《无限盖楼》竣工证书', W / 2, H * 0.62)

    // 楼层（大号）
    ctx.font = `900 ${110 * scale}px Arial, sans-serif`
    ctx.fillStyle = '#FFD700'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 8 * scale
    ctx.fillText(`${floor}F`, W / 2, H * 0.75)
    ctx.shadowBlur = 0

    // 分数
    ctx.font = `bold ${32 * scale}px Arial, sans-serif`
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(`得分：${score}`, W / 2, H * 0.83)

    // 连击
    if (perfectCombo >= 2) {
      ctx.font = `${28 * scale}px Arial, sans-serif`
      ctx.fillStyle = '#FF9800'
      ctx.fillText(`最长连击：${perfectCombo} 次`, W / 2, H * 0.88)
    }

    // 底部品牌
    ctx.font = `${22 * scale}px Arial, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText('无限盖楼 · 你的城市，你说了算', W / 2, H * 0.96)
    ctx.restore()
  }

  _drawBadge(ctx, W, H, scale, combo) {
    ctx.save()
    // 金色徽章背景
    ctx.beginPath()
    ctx.arc(W * 0.82, H * 0.18, 40 * scale, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 215, 0, 0.9)'
    ctx.fill()
    ctx.font = `bold ${18 * scale}px Arial`
    ctx.fillStyle = '#7B3F00'
    ctx.textAlign = 'center'
    ctx.fillText('🔥', W * 0.82, H * 0.185)
    ctx.font = `bold ${14 * scale}px Arial`
    ctx.fillText(`×${combo}`, W * 0.82, H * 0.21)
    ctx.restore()
  }

  _drawWatermark(ctx, W, H, scale) {
    ctx.save()
    ctx.globalAlpha = 0.35
    ctx.font = `${20 * scale}px Arial`
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    // 对角水印
    ctx.translate(W / 2, H / 2)
    ctx.rotate(-Math.PI / 6)
    for (let row = -3; row <= 3; row++) {
      for (let col = -2; col <= 2; col++) {
        ctx.fillText('无限盖楼', col * 220 * scale, row * 150 * scale)
      }
    }
    ctx.restore()
  }

  /**
   * 纯文字降级卡片（不需要背景图）
   */
  _composeFallback(stats, { watermark }) {
    const W = FREE_WIDTH
    const H = Math.round(W * 1.6)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#1A237E')
    grad.addColorStop(1, '#0D0D2B')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    this._drawCardText(ctx, stats, W, H, 1)
    if (watermark) this._drawWatermark(ctx, W, H, 1)

    return canvas.toDataURL('image/png')
  }

  _getTheme(floor) {
    if (floor < 10) return 'day'
    if (floor < 20) return 'dusk'
    if (floor < 40) return 'night'
    return 'star'
  }
}
