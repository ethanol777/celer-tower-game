/**
 * 本地数据存储管理
 * 技术方案 §4.3
 *
 * localStorage key: tower_game_data
 * {
 *   "bestFloor": 47,
 *   "bestScore": 2350,
 *   "coins": 0,             // 本局复活币（每局开始归零）
 *   "ownedThemes": ["dusk", "star"],
 *   "dailyFreeCard": { "date": "2026-06-29", "used": false }
 * }
 */

const STORAGE_KEY = 'tower_game_data'

function getDefault() {
  return {
    bestFloor: 0,
    bestScore: 0,
    coins: 0,   // 每局开始没有复活币，购买后仅本局使用
    ownedThemes: [],
    dailyFreeCard: { date: '', used: false },
  }
}

export const store = {
  _data: null,

  load() {
    if (this._data) return this._data
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      this._data = raw ? { ...getDefault(), ...JSON.parse(raw) } : getDefault()
    } catch (e) {
      this._data = getDefault()
    }
    return this._data
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data))
    } catch (e) {
      console.warn('[Store] 保存失败', e)
    }
  },

  get(key) {
    return this.load()[key]
  },

  set(key, value) {
    this.load()[key] = value
    this.save()
  },

  // 更新最高楼层/分数
  updateBest(floor, score) {
    const data = this.load()
    let updated = false
    if (floor > data.bestFloor) { data.bestFloor = floor; updated = true }
    if (score > data.bestScore) { data.bestScore = score; updated = true }
    if (updated) this.save()
    return updated
  },

  // 消耗复活币
  useReviveCoin() {
    const data = this.load()
    if (data.coins <= 0) return false
    data.coins -= 1
    this.save()
    return true
  },

  // 增加复活币
  addCoins(n) {
    const data = this.load()
    data.coins += n
    this.save()
  },

  // 是否拥有主题
  hasTheme(theme) {
    return this.load().ownedThemes.includes(theme)
  },

  // 解锁主题
  unlockTheme(theme) {
    const data = this.load()
    if (!data.ownedThemes.includes(theme)) {
      data.ownedThemes.push(theme)
      this.save()
    }
  },

  // 每日免费高清卡片
  canUseFreeCard() {
    const data = this.load()
    const today = new Date().toISOString().slice(0, 10)
    if (data.dailyFreeCard.date !== today) {
      // 新的一天，重置
      data.dailyFreeCard = { date: today, used: false }
      this.save()
    }
    return !data.dailyFreeCard.used
  },

  useFreeCard() {
    const data = this.load()
    data.dailyFreeCard.used = true
    this.save()
  },
}
