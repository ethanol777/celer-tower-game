/**
 * 结算页与付费弹窗管理
 * 技术方案 §4.1 §4.2
 *
 * 三个弹窗触发逻辑：
 * 1. 结算卡片付费（游戏结束时）
 * 2. 主题包付费（每 20/40/60 层里程碑）
 * 3. 复活币付费（最后1条命 / 排行榜差距）
 * 4. 排行榜展示 + 分享/挑战链接
 */

import { AICardGenerator } from '../ai/card'
import { paymentService } from './payment'
import { store } from './store'
import { leaderboard } from './leaderboard'

const cardGenerator = new AICardGenerator()

// ──────────────────────────────────────────────
// 样式注入（只注入一次）
// ──────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('tower-game-styles')) return
  const style = document.createElement('style')
  style.id = 'tower-game-styles'
  style.textContent = `
    .tg-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.75);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
    }
    .tg-modal {
      background: linear-gradient(160deg, #1a1a3e 0%, #0d0d2b 100%);
      border: 1px solid rgba(255,215,0,0.3);
      border-radius: 20px;
      padding: 28px 24px;
      width: 88vw; max-width: 400px;
      color: #FFF;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      position: relative;
    }
    .tg-modal h2 { font-size: 22px; margin: 0 0 8px; color: #FFD700; }
    .tg-modal p { font-size: 14px; color: rgba(255,255,255,0.7); margin: 4px 0; }
    .tg-card-preview {
      width: 100%; max-height: 250px;
      object-fit: cover; border-radius: 12px;
      margin: 12px 0; display: block;
    }
    .tg-card-free { position: relative; }
    .tg-blur { filter: blur(6px); }
    .tg-blur-label {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%,-50%);
      background: rgba(0,0,0,0.6);
      color: #FFD700; font-size: 16px; font-weight: bold;
      padding: 8px 16px; border-radius: 8px; white-space: nowrap;
    }
    .tg-btn {
      display: block; width: 100%;
      padding: 14px; margin: 8px 0;
      border: none; border-radius: 12px;
      font-size: 16px; font-weight: bold;
      cursor: pointer; transition: opacity 0.2s;
    }
    .tg-btn:active { opacity: 0.8; }
    .tg-btn-primary { background: linear-gradient(90deg,#FF8C00,#FFD700); color: #000; }
    .tg-btn-secondary { background: rgba(255,255,255,0.12); color: #FFF; }
    .tg-btn-danger { background: linear-gradient(90deg,#F44336,#E91E63); color: #FFF; }
    .tg-stat-row { display: flex; justify-content: space-around; margin: 16px 0; }
    .tg-stat { text-align: center; }
    .tg-stat-num { font-size: 28px; font-weight: 900; color: #FFD700; display: block; }
    .tg-stat-label { font-size: 12px; color: rgba(255,255,255,0.6); }
    .tg-countdown {
      font-size: 32px; font-weight: 900;
      color: #FF5252; display: block; margin: 8px 0;
    }
    .tg-close {
      position: absolute; top: 12px; right: 16px;
      background: none; border: none; color: rgba(255,255,255,0.5);
      font-size: 20px; cursor: pointer;
    }
    .tg-leaderboard { margin: 12px 0; max-height: 200px; overflow-y: auto; }
    .tg-rank-row {
      display: flex; align-items: center; padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 13px;
    }
    .tg-rank-row.me { background: rgba(255,215,0,0.1); border-radius: 6px; padding: 8px 6px; }
    .tg-rank-num { width: 28px; color: rgba(255,255,255,0.5); font-size: 12px; text-align: center; }
    .tg-rank-num.top3 { color: #FFD700; font-weight: bold; font-size: 14px; }
    .tg-rank-name { flex: 1; text-align: left; padding-left: 6px; color: #FFF; }
    .tg-rank-floor { color: #FFD700; font-weight: bold; min-width: 40px; text-align: right; }
    .tg-rank-gap {
      font-size: 11px; color: #FF5252;
      margin-left: 8px; white-space: nowrap;
    }
    .tg-challenge-banner {
      background: rgba(255,82,82,0.15);
      border: 1px solid rgba(255,82,82,0.4);
      border-radius: 10px; padding: 10px 14px;
      margin-bottom: 12px; font-size: 14px; color: #FF8A80;
    }
    .tg-share-row { display: flex; gap: 8px; margin: 4px 0; }
    .tg-share-row .tg-btn { flex: 1; padding: 11px 6px; font-size: 14px; }
    .tg-scroll-hint { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 4px; }
  `
  document.head.appendChild(style)
}

function createOverlay() {
  const el = document.createElement('div')
  el.className = 'tg-overlay'
  const stop = (e) => {
    e.stopPropagation()
  }
  // 阻止弹窗触摸/点击事件继续冒泡到游戏 Canvas，避免购买/复活按钮触发落块
  el.addEventListener('touchstart', stop, { passive: false })
  el.addEventListener('touchend', stop, { passive: false })
  el.addEventListener('mousedown', stop)
  el.addEventListener('mouseup', stop)
  el.addEventListener('click', stop)
  return el
}

function removeOverlay(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el)
}

// ──────────────────────────────────────────────
// 弹窗 1：结算页（游戏结束触发）
// ──────────────────────────────────────────────

/**
 * @param {object} params
 * @param {object} params.stats - { floor, score, perfectCombo }
 * @param {HTMLImageElement} params.bgImg - 最高层背景图
 * @param {object} params.aiConfig
 * @param {Function} params.onRestart - "再来一局"回调
 */
export async function showSettlementPage({ stats, bgImg, aiConfig, onRestart }) {
  injectStyles()
  store.updateBest(stats.floor, stats.score)

  // 提前生成卡片（可能已在游戏快结束时开始生成）
  if (!cardGenerator.freeCard) {
    await cardGenerator.generate(stats, bgImg, aiConfig)
  }

  // 上报分数 + 拉取排行榜（并行）
  const [, rankList] = await Promise.all([
    leaderboard.submitScore(stats.floor, stats.score),
    leaderboard.fetchTop(20),
  ])

  // 检查挑战链接
  const challengeInfo = leaderboard.parseChallengeLink()

  // 检查复活追分提示
  const revivePrompt = leaderboard.checkRevivePrompt(stats.floor, rankList)

  const overlay = createOverlay()
  // 加 overflow-y scroll 支持长内容
  const modal = document.createElement('div')
  modal.className = 'tg-modal'
  modal.style.maxHeight = '90vh'
  modal.style.overflowY = 'auto'

  const canUseFree = store.canUseFreeCard()
  const previewClass = canUseFree ? '' : 'tg-blur'
  const challengeBanner = challengeInfo.isChallenge
    ? `<div class="tg-challenge-banner">🏆 挑战目标：${challengeInfo.challengerFloor} 层</div>`
    : ''

  const shareLink = leaderboard.generateChallengeLink(stats.floor, stats.score)

  modal.innerHTML = `
    ${challengeBanner}
    <h2>🏙 竣工证书</h2>
    <div class="tg-stat-row">
      <div class="tg-stat"><span class="tg-stat-num">${stats.floor}</span><span class="tg-stat-label">楼层</span></div>
      <div class="tg-stat"><span class="tg-stat-num">${stats.score}</span><span class="tg-stat-label">得分</span></div>
      <div class="tg-stat"><span class="tg-stat-num">${stats.perfectCombo || 0}</span><span class="tg-stat-label">最长连击</span></div>
    </div>
    <div class="tg-card-free" style="position:relative">
      <img class="tg-card-preview ${previewClass}" id="tg-free-card-img" src="${cardGenerator.freeCard || ''}" />
      ${!canUseFree ? '<div class="tg-blur-label">🔒 付费解锁高清版</div>' : ''}
    </div>
    <button class="tg-btn tg-btn-primary" id="tg-btn-premium">
      ${canUseFree ? '✨ 今日免费 · 保存高清版' : '✨ ¥1 解锁高清去水印版'}
    </button>
    <div class="tg-share-row">
      <button class="tg-btn tg-btn-secondary" id="tg-btn-save-free">💾 保存免费版</button>
      <button class="tg-btn tg-btn-secondary" id="tg-btn-share">🔗 挑战好友</button>
    </div>

    <h3 style="margin:16px 0 8px; font-size:15px; color:rgba(255,255,255,0.7);">🏆 排行榜</h3>
    <div class="tg-leaderboard" id="tg-leaderboard">
      ${_renderRankList(rankList, stats.floor)}
    </div>
    <p class="tg-scroll-hint">滑动查看更多</p>

    ${revivePrompt.shouldPrompt ? `
      <div class="tg-challenge-banner" style="color:#FFD700; margin-top:12px;">
        ⚡ 再差 ${revivePrompt.gap} 层就能超过 <b>${revivePrompt.targetUser.nickname}</b>！
        <button class="tg-btn tg-btn-danger" id="tg-btn-revive-chase" style="margin-top:8px; padding:10px">
          用复活币回到最后10层前重打
        </button>
      </div>
    ` : ''}

    <button class="tg-btn tg-btn-secondary" id="tg-btn-restart" style="margin-top:8px;">🔄 再来一局</button>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  // 解锁高清版
  document.getElementById('tg-btn-premium').onclick = async () => {
    if (canUseFree) {
      store.useFreeCard()
      _downloadCard(cardGenerator.premiumCard || cardGenerator.freeCard, 'tower-premium.png')
    } else {
      const btn = document.getElementById('tg-btn-premium')
      btn.textContent = '支付中...'
      btn.disabled = true
      const result = await paymentService.buy('card_single_1yuan')
      if (result.success) {
        _downloadCard(cardGenerator.premiumCard || cardGenerator.freeCard, 'tower-premium.png')
        btn.textContent = '✅ 下载成功！'
      } else {
        btn.textContent = '支付失败，请重试'
        btn.disabled = false
      }
    }
  }

  // 保存免费版
  document.getElementById('tg-btn-save-free').onclick = () => {
    _downloadCard(cardGenerator.freeCard, 'tower-free.png')
  }

  // 分享挑战链接
  document.getElementById('tg-btn-share').onclick = () => {
    _shareLink(shareLink, stats)
  }

  // 复活追分
  const reviveChaseBtn = document.getElementById('tg-btn-revive-chase')
  if (reviveChaseBtn) {
    reviveChaseBtn.onclick = async () => {
      reviveChaseBtn.textContent = '支付中...'
      reviveChaseBtn.disabled = true
      const result = await paymentService.buy('revive_coin_1')
      if (result.success) {
        removeOverlay(overlay)
        cardGenerator.freeCard = null
        cardGenerator.premiumCard = null
        if (onRestart) onRestart()
      } else {
        reviveChaseBtn.textContent = '支付失败'
        reviveChaseBtn.disabled = false
      }
    }
  }

  // 再来一局
  document.getElementById('tg-btn-restart').onclick = () => {
    removeOverlay(overlay)
    cardGenerator.freeCard = null
    cardGenerator.premiumCard = null
    if (onRestart) onRestart()
  }
}

// ──────────────────────────────────────────────
// 弹窗 2：主题包引导（里程碑触发）
// ──────────────────────────────────────────────

const THEME_SKU_MAP = {
  20: { sku: 'theme_dusk',     name: '🌅 黄昏霓虹', price: '¥6' },
  40: { sku: 'theme_star',     name: '🌙 星空悬城', price: '¥6' },
  60: { sku: 'theme_cyberpunk',name: '🤖 赛博朋克', price: '¥8' },
}

/**
 * @param {number} floor - 当前楼层
 * @param {HTMLImageElement} previewImg - 模糊预览图
 * @param {Function} onPurchase - 购买成功回调（切换主题）
 */
export function showThemePackModal(floor, previewImg, onPurchase) {
  const themeInfo = THEME_SKU_MAP[floor]
  if (!themeInfo) return
  if (store.hasTheme(themeInfo.sku.replace('theme_', ''))) return

  injectStyles()
  const overlay = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'tg-modal'

  const previewSrc = previewImg ? (previewImg.src || previewImg) : ''
  modal.innerHTML = `
    <button class="tg-close" id="tg-theme-close">✕</button>
    <h2>${themeInfo.name} 主题包</h2>
    <p>解锁专属城市背景 + 楼层皮肤</p>
    ${previewSrc ? `<div style="position:relative"><img class="tg-card-preview tg-blur" src="${previewSrc}" /><div class="tg-blur-label">解锁后即可享用</div></div>` : ''}
    <button class="tg-btn tg-btn-primary" id="tg-btn-buy-theme">
      ${themeInfo.price} 立即解锁 · 当前局即生效
    </button>
    <button class="tg-btn tg-btn-secondary" id="tg-btn-skip-theme">下次再说</button>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  document.getElementById('tg-theme-close').onclick = () => removeOverlay(overlay)
  document.getElementById('tg-btn-skip-theme').onclick = () => removeOverlay(overlay)

  document.getElementById('tg-btn-buy-theme').onclick = async () => {
    const btn = document.getElementById('tg-btn-buy-theme')
    btn.textContent = '支付中...'
    btn.disabled = true
    const result = await paymentService.buy(themeInfo.sku)
    if (result.success) {
      removeOverlay(overlay)
      if (onPurchase) onPurchase(themeInfo.sku.replace('theme_', ''))
    } else {
      btn.textContent = '支付失败，请重试'
      btn.disabled = false
    }
  }
}

// ──────────────────────────────────────────────
// 弹窗 3：复活币弹窗（最后1条命触发）
// ──────────────────────────────────────────────

/**
 * @param {object} params
 * @param {'warning'|'death'} params.mode - warning=仅剩一命提示；death=最后一命失去后的复活/结算
 * @param {Function} params.onRevive - 复活成功回调
 * @param {Function} params.onGiveUp - 最终结算回调
 * @param {Function} params.onContinue - warning 模式关闭/倒计时结束后继续游戏
 */
export function showReviveModal({
  mode = 'warning',
  reviveCoins = 0,
  onRevive,
  onGiveUp,
  onContinue,
  onOpen,
  onClose,
  onBuyReviveCoin,
  onUseReviveCoin,
}) {
  injectStyles()
  if (onOpen) onOpen()
  const isDeathMode = mode === 'death'
  const coins = Number(reviveCoins) || 0
  const overlay = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'tg-modal'

  modal.innerHTML = `
    <button class="tg-close" id="tg-revive-close">×</button>
    <h2>${isDeathMode ? '💀 游戏结束' : '⚠️ 仅剩最后1条命'}</h2>
    <p>${isDeathMode ? '最后一条命也失去了，是否复活继续？' : '现在可以提前购买复活币，下一次失误后可继续挑战。'}</p>
    ${isDeathMode ? `
      ${coins > 0 ? `
        <button class="tg-btn tg-btn-danger" id="tg-btn-revive">⚡ 使用复活币继续</button>
      ` : `
        <button class="tg-btn tg-btn-primary" id="tg-btn-buy-coin">¥1 购买复活币并继续</button>
      `}
      <button class="tg-btn tg-btn-secondary" id="tg-btn-settle-now">直接结算</button>
    ` : `
      <button class="tg-btn tg-btn-primary" id="tg-btn-buy-coin">¥1 购买复活币</button>
      <p style="font-size:12px; margin-top:12px; color:rgba(255,255,255,0.55)">
        <span id="tg-revive-countdown">5</span> 秒后自动继续
      </p>
    `}
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  const cleanup = () => {
    if (timer) clearInterval(timer)
    removeOverlay(overlay)
    if (onClose) onClose()
  }

  const continueGame = () => {
    cleanup()
    if (onContinue) onContinue()
  }

  const settleGame = () => {
    cleanup()
    if (onGiveUp) onGiveUp()
  }

  // 5秒倒计时：仅 warning 自动继续；death 不再自动结算，等待用户主动选择
  let count = 5
  const timer = isDeathMode ? null : setInterval(() => {
    count -= 1
    const el = document.getElementById('tg-revive-countdown')
    if (el) el.textContent = count
    if (count <= 0) {
      continueGame()
    }
  }, 1000)

  // 右上角关闭：warning 继续；death 结算
  document.getElementById('tg-revive-close').onclick = () => {
    if (isDeathMode) settleGame()
    else continueGame()
  }

  // 主动结算按钮（仅 death 模式）
  const settleBtn = document.getElementById('tg-btn-settle-now')
  if (settleBtn) {
    settleBtn.onclick = () => {
      settleGame()
    }
  }

  // 使用复活币（仅 death 模式）
  const reviveBtn = document.getElementById('tg-btn-revive')
  if (reviveBtn) {
    reviveBtn.onclick = () => {
      const used = coins > 0
      if (used) {
        if (onUseReviveCoin) onUseReviveCoin()
        cleanup()
        if (onRevive) onRevive()
      }
    }
  }

  // 购买复活币：warning 只购买并继续；death 购买后立即使用并复活
  const buyBtn = document.getElementById('tg-btn-buy-coin')
  if (buyBtn) {
    buyBtn.onclick = async () => {
      buyBtn.textContent = '支付中...'
      buyBtn.disabled = true
      const result = await paymentService.buy('revive_coin_1')
      if (result.success) {
        if (isDeathMode) {
          cleanup()
          if (onRevive) onRevive()
        } else {
          if (onBuyReviveCoin) onBuyReviveCoin(1)
          cleanup()
          if (onContinue) onContinue()
        }
      } else {
        buyBtn.textContent = '支付失败，请重试'
        buyBtn.disabled = false
      }
    }
  }
}

// ──────────────────────────────────────────────
// 复活倒计时遮罩（复活成功后显示 3 秒，倒计时结束恢复游戏）
// ──────────────────────────────────────────────

/**
 * 复活成功后的3秒暂停倒计时遮罩
 * @param {Function} onResume - 倒计时结束后的恢复游戏回调
 */
export function showReviveCountdown(onResume) {
  injectStyles()

  // 确保包含倒计时遮罩样式
  const existingStyle = document.getElementById('tower-game-styles')
  if (existingStyle && !existingStyle.textContent.includes('tg-revive-cd-overlay')) {
    existingStyle.textContent += `
      .tg-revive-cd-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.55);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
        pointer-events: none;
      }
      .tg-revive-cd-num {
        font-size: 120px; font-weight: 900;
        color: #FFD700;
        text-shadow: 0 0 40px rgba(255,215,0,0.8), 0 4px 16px rgba(0,0,0,0.6);
        line-height: 1;
        animation: tg-cd-pop 0.4s ease-out;
      }
      .tg-revive-cd-label {
        font-size: 20px; font-weight: bold;
        color: rgba(255,255,255,0.85);
        margin-top: 16px;
        letter-spacing: 2px;
      }
      @keyframes tg-cd-pop {
        from { transform: scale(1.6); opacity: 0.4; }
        to   { transform: scale(1);   opacity: 1; }
      }
    `
  }

  const overlay = document.createElement('div')
  overlay.className = 'tg-revive-cd-overlay'

  const numEl = document.createElement('div')
  numEl.className = 'tg-revive-cd-num'
  numEl.textContent = '3'

  const labelEl = document.createElement('div')
  labelEl.className = 'tg-revive-cd-label'
  labelEl.textContent = '复活成功，准备继续！'

  overlay.appendChild(numEl)
  overlay.appendChild(labelEl)
  document.body.appendChild(overlay)

  let count = 3
  const tick = () => {
    count -= 1
    if (count <= 0) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      if (onResume) onResume()
      return
    }
    numEl.textContent = count
    // 重置动画
    numEl.style.animation = 'none'
    void numEl.offsetWidth
    numEl.style.animation = 'tg-cd-pop 0.4s ease-out'
    setTimeout(tick, 1000)
  }
  setTimeout(tick, 1000)
}

// ──────────────────────────────────────────────
// 内部辅助
// ──────────────────────────────────────────────

function _downloadCard(dataUrl, filename) {
  if (!dataUrl) return
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename || 'tower-card.png'
  a.click()
}

/**
 * 渲染排行榜列表 HTML
 */
function _renderRankList(rankList, myFloor) {
  if (!rankList || rankList.length === 0) {
    return '<p style="color:rgba(255,255,255,0.4); font-size:13px;">暂无排行数据</p>'
  }
  return rankList.map(item => {
    const isMe = item.isMe || false
    const isTop3 = item.rank <= 3
    const rankIcon = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank
    const gap = isMe && !isTop3 ? '' : ''
    return `
      <div class="tg-rank-row ${isMe ? 'me' : ''}">
        <span class="tg-rank-num ${isTop3 ? 'top3' : ''}">${rankIcon}</span>
        <span class="tg-rank-name">${item.nickname}${isMe ? ' (我)' : ''}</span>
        <span class="tg-rank-floor">${item.floor}层</span>
      </div>
    `
  }).join('')
}

/**
 * 分享挑战链接
 */
function _shareLink(link, stats) {
  const text = `我在《无限盖楼》盖了 ${stats.floor} 层楼！得分 ${stats.score}，你能超过我吗？`

  // 优先使用 Web Share API（移动端）
  if (navigator.share) {
    navigator.share({
      title: '无限盖楼',
      text,
      url: link,
    }).catch(() => _copyToClipboard(link, text))
  } else {
    _copyToClipboard(link, text)
  }
}

function _copyToClipboard(link, text) {
  const fullText = `${text}\n${link}`
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullText).then(() => {
      _showToast('链接已复制，快去发给好友！')
    })
  } else {
    // 兜底：prompt
    window.prompt('复制以下链接分享给好友：', fullText)
  }
}

function _showToast(msg) {
  const toast = document.createElement('div')
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.8); color: #FFF; padding: 10px 20px;
    border-radius: 20px; font-size: 14px; z-index: 99999;
    white-space: nowrap;
  `
  toast.textContent = msg
  document.body.appendChild(toast)
  setTimeout(() => toast.parentNode && toast.parentNode.removeChild(toast), 2500)
}

export { cardGenerator }
