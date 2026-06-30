/**
 * 排行榜模块
 * 技术方案 §4.2
 *
 * 功能：
 * - 游戏结束后上报分数到后端
 * - 结算页拉取 Top20 排行榜
 * - 差距 ≤ 5 层时展示"复活追分"提示
 * - 挑战链接：/game?challenge=<userId>&record=<floor> 格式
 *
 * MVP 阶段：后端 API 未接入时使用本地模拟数据
 */

import { store } from './store'

// API 基础地址（生产环境替换）
const API_BASE = window.TOWER_API_BASE || ''
const USE_MOCK = !API_BASE

// 本地模拟排行榜数据（MVP 阶段）
const MOCK_LEADERBOARD = [
  { rank: 1, userId: 'user_001', nickname: '建筑大师', floor: 88, score: 4450 },
  { rank: 2, userId: 'user_002', nickname: '摩天楼王', floor: 73, score: 3680 },
  { rank: 3, userId: 'user_003', nickname: '城市规划师', floor: 61, score: 3100 },
  { rank: 4, userId: 'user_004', nickname: '积木达人', floor: 54, score: 2730 },
  { rank: 5, userId: 'user_005', nickname: '天空大厦', floor: 47, score: 2380 },
  { rank: 6, userId: 'user_006', nickname: '高楼建设者', floor: 42, score: 2120 },
  { rank: 7, userId: 'user_007', nickname: '楼层挑战者', floor: 38, score: 1920 },
  { rank: 8, userId: 'user_008', nickname: '建筑新星', floor: 33, score: 1670 },
  { rank: 9, userId: 'user_009', nickname: '空中花园', floor: 28, score: 1420 },
  { rank: 10, userId: 'user_010', nickname: '垂直城市', floor: 24, score: 1210 },
]

// 本地玩家 ID（MVP 阶段用随机生成的持久 ID）
function getLocalUserId() {
  let uid = localStorage.getItem('tower_user_id')
  if (!uid) {
    uid = 'local_' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem('tower_user_id', uid)
  }
  return uid
}

export const leaderboard = {
  /**
   * 上报本局成绩
   * @param {number} floor
   * @param {number} score
   */
  async submitScore(floor, score) {
    const userId = getLocalUserId()
    store.updateBest(floor, score)

    if (USE_MOCK) {
      console.log(`[Leaderboard Mock] 上报分数：userId=${userId} floor=${floor} score=${score}`)
      return { success: true }
    }

    try {
      const resp = await fetch(`${API_BASE}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, floor, score, timestamp: Date.now() }),
      })
      return await resp.json()
    } catch (err) {
      console.warn('[Leaderboard] 上报失败：', err)
      return { success: false }
    }
  },

  /**
   * 拉取排行榜
   * @param {number} top - 取前 N 名
   * @returns {Promise<Array>} 排行榜数组
   */
  async fetchTop(top = 20) {
    if (USE_MOCK) {
      // Mock：将玩家本地最高分插入排行榜
      return this._getMockWithPlayer(top)
    }

    try {
      const resp = await fetch(`${API_BASE}/api/leaderboard?top=${top}`)
      const data = await resp.json()
      return data.list || []
    } catch (err) {
      console.warn('[Leaderboard] 拉取失败，使用本地数据：', err)
      return this._getMockWithPlayer(top)
    }
  },

  /**
   * 检查与上一名的差距（用于触发复活提示）
   * @param {number} myFloor
   * @param {Array} rankList
   * @returns {{ shouldPrompt: boolean, targetUser: object|null, gap: number }}
   */
  checkRevivePrompt(myFloor, rankList) {
    const myRank = this._getMyRank(myFloor, rankList)
    if (myRank <= 1) return { shouldPrompt: false, targetUser: null, gap: 0 }

    const prevUser = rankList[myRank - 2] // 上一名（0-based）
    const gap = prevUser.floor - myFloor
    return {
      shouldPrompt: gap > 0 && gap <= 5,
      targetUser: prevUser,
      gap,
    }
  },

  /**
   * 生成挑战链接
   * @param {number} floor
   * @param {number} score
   * @returns {string} 完整 URL
   */
  generateChallengeLink(floor, score) {
    const userId = getLocalUserId()
    const base = window.location.origin + window.location.pathname
    return `${base}?challenge=${encodeURIComponent(userId)}&record=${floor}&score=${score}`
  },

  /**
   * 解析挑战链接（游戏进入时调用）
   * @returns {{ isChallenge: boolean, challengerFloor: number, challengerScore: number }}
   */
  parseChallengeLink() {
    const params = new URLSearchParams(window.location.search)
    const challenge = params.get('challenge')
    const record = parseInt(params.get('record') || '0', 10)
    const score = parseInt(params.get('score') || '0', 10)
    return {
      isChallenge: !!challenge,
      challengerUserId: challenge,
      challengerFloor: record,
      challengerScore: score,
    }
  },

  // ────────────────────────────
  // 私有辅助
  // ────────────────────────────

  _getMockWithPlayer(top) {
    const bestFloor = store.get('bestFloor') || 0
    const bestScore = store.get('bestScore') || 0
    const playerEntry = {
      rank: 0,
      userId: getLocalUserId(),
      nickname: '我',
      floor: bestFloor,
      score: bestScore,
      isMe: true,
    }

    // 将玩家插入到正确位置
    const all = [...MOCK_LEADERBOARD, playerEntry]
      .sort((a, b) => b.floor - a.floor || b.score - a.score)
      .slice(0, top)
      .map((item, i) => ({ ...item, rank: i + 1 }))

    return all
  },

  _getMyRank(myFloor, rankList) {
    let rank = rankList.length + 1
    for (let i = 0; i < rankList.length; i++) {
      if (myFloor >= rankList[i].floor) {
        rank = i + 1
        break
      }
    }
    return rank
  },
}
