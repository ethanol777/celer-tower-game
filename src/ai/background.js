/**
 * AI 背景图管理器
 * 技术方案 §3.1
 *
 * 功能：
 * - 游戏加载时预生成白天+黄昏两个阶段（各5张）
 * - 每10层切换背景阶段，随机抽取缓存中的一张
 * - 到达阶段前10层时异步补充下一阶段缓存
 * - AI 不可用时自动降级到静态背景
 */

import { generateBackground } from './api'

const THEME_FLOOR_MAP = [
  { theme: 'day',   minFloor: 0,  maxFloor: 10 },
  { theme: 'dusk',  minFloor: 10, maxFloor: 20 },
  { theme: 'night', minFloor: 20, maxFloor: 40 },
  { theme: 'star',  minFloor: 40, maxFloor: Infinity },
]

const CACHE_SIZE = 5

export class AIBackgroundManager {
  constructor(config = {}) {
    this.config = config
    this.cache = { day: [], dusk: [], night: [], star: [] }
    this.loading = { day: false, dusk: false, night: false, star: false }
    this.currentImg = null
    this.currentTheme = null
    this._preloadDone = false
    // 渐进加载占位图（低分辨率模糊背景）
    this.placeholderColor = { day: '#87CEEB', dusk: '#FF6F00', night: '#1A237E', star: '#0D0D2B' }
  }

  /**
   * 游戏启动时预加载前两个阶段
   */
  async preload() {
    if (this._preloadDone) return
    this._preloadDone = true
    await Promise.all([
      this._generate('day', CACHE_SIZE),
      this._generate('dusk', CACHE_SIZE),
    ])
  }

  /**
   * 根据楼层切换背景
   * @param {number} floor - 当前楼层（successCount）
   * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
   * @param {number} width - 画布宽
   * @param {number} height - 画布高
   */
  switchBackground(floor) {
    const theme = this._getTheme(floor)
    const imgs = this.cache[theme]

    if (imgs.length > 0) {
      // 随机抽取一张
      this.currentImg = imgs[Math.floor(Math.random() * imgs.length)]
      this.currentTheme = theme
    } else {
      // 缓存为空（还在生成中），保持当前背景
      console.warn(`[AI Background] ${theme} 缓存未就绪，保持当前背景`)
    }

    // 触发下一阶段预加载
    this._ensureNextStage(floor)
  }

  /**
   * 将当前 AI 背景图渲染到 Canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   * @returns {boolean} 是否渲染了 AI 图片
   */
  render(ctx, width, height) {
    if (!this.currentImg) return false
    ctx.save()
    ctx.drawImage(this.currentImg, 0, 0, width, height)
    ctx.restore()
    return true
  }

  /**
   * 获取指定楼层最高时的背景图（用于结算卡片）
   * @param {number} floor
   * @returns {HTMLImageElement|null}
   */
  getHighestLayerBg(floor) {
    const theme = this._getTheme(floor)
    const imgs = this.cache[theme]
    if (imgs.length > 0) return imgs[0]
    return this.currentImg
  }

  // ────────────────────────────
  // 私有方法
  // ────────────────────────────

  _getTheme(floor) {
    for (const { theme, minFloor, maxFloor } of THEME_FLOOR_MAP) {
      if (floor >= minFloor && floor < maxFloor) return theme
    }
    return 'star'
  }

  async _generate(theme, count) {
    if (this.loading[theme]) return
    this.loading[theme] = true
    try {
      const imgs = await Promise.all(
        Array(count).fill(0).map(() => generateBackground(theme, this.config))
      )
      this.cache[theme].push(...imgs)
    } catch (err) {
      console.warn(`[AI Background] ${theme} 生成失败：`, err)
    } finally {
      this.loading[theme] = false
    }
  }

  _ensureNextStage(floor) {
    // 到达阶段前10层时，预加载下一阶段
    for (let i = 0; i < THEME_FLOOR_MAP.length - 1; i++) {
      const current = THEME_FLOOR_MAP[i]
      const next = THEME_FLOOR_MAP[i + 1]
      if (floor >= current.maxFloor - 10 && floor < current.maxFloor) {
        if (this.cache[next.theme].length === 0 && !this.loading[next.theme]) {
          this._generate(next.theme, CACHE_SIZE)
        }
        break
      }
    }
  }
}

// 单例（每局游戏共享一个实例）
let _instance = null

export function getAIBackgroundManager(config) {
  if (!_instance || config) {
    _instance = new AIBackgroundManager(config || {})
  }
  return _instance
}
