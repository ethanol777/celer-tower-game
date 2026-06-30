import * as constant from './constant'

// ─────────────────────────────────────────────
// 移动 / 速度计算
// ─────────────────────────────────────────────

export const checkMoveDown = engine =>
  (engine.checkTimeMovement(constant.moveDownMovement))

export const getMoveDownValue = (engine, store) => {
  const pixelsPerFrame = store ? store.pixelsPerFrame : engine.pixelsPerFrame.bind(engine)
  const successCnt = engine.getVariable(constant.successCount)
  const calHeight = engine.getVariable(constant.blockHeight) * 2
  if (successCnt <= 4) {
    return pixelsPerFrame(calHeight * 1.25)
  }
  return pixelsPerFrame(calHeight)
}

export const getAngleBase = (engine) => {
  const successCnt = engine.getVariable(constant.successCount)
  const gameScoreVal = engine.getVariable(constant.gameScore)
  const { hookAngle } = engine.getVariable(constant.gameUserOption)
  if (hookAngle) {
    return hookAngle(successCnt, gameScoreVal)
  }
  if (engine.getVariable(constant.hardMode)) {
    return 90
  }
  switch (true) {
    case successCnt < 10:
      return 30
    case successCnt < 20:
      return 60
    default:
      return 80
  }
}

/**
 * 摆动速度（正弦周期）
 * 技术方案 §2.3：分段 hard 值 + 动态难度修正
 */
export const getSwingBlockVelocity = (engine, time) => {
  const successCnt = engine.getVariable(constant.successCount)
  const gameScoreVal = engine.getVariable(constant.gameScore)
  const { hookSpeed } = engine.getVariable(constant.gameUserOption)
  if (hookSpeed) {
    return hookSpeed(successCnt, gameScoreVal)
  }

  let hard
  switch (true) {
    case successCnt < 1:
      hard = 0
      break
    case successCnt < 10:
      hard = 1.0
      break
    case successCnt < 20:
      hard = 0.8  // 放慢，给玩家喘息感
      break
    case successCnt < 30:
      hard = 0.7  // 付费主题包引导时机
      break
    default:
      hard = 0.74 // 高层趋于稳定
      break
  }

  if (engine.getVariable(constant.hardMode)) {
    hard = 1.1
  }

  // 动态难度修正：最近10块失误率 > 50% 时降速 15%
  const recent = engine.getVariable(constant.recentBlocks) || []
  if (recent.length >= constant.recentBlocksWindow) {
    const failCount = recent.filter(r => r === 'fail').length
    const failRate = failCount / recent.length
    if (failRate > 0.5) {
      hard = hard * 0.85
    }
  }

  return Math.sin(time / (200 / hard))
}

/**
 * 落地积木横向漂移速度（楼体摇晃感）
 * 技术方案 §2.4
 */
export const getLandBlockVelocity = (engine, time) => {
  const successCnt = engine.getVariable(constant.successCount)
  const gameScoreVal = engine.getVariable(constant.gameScore)
  const { landBlockSpeed } = engine.getVariable(constant.gameUserOption)
  if (landBlockSpeed) {
    return landBlockSpeed(successCnt, gameScoreVal)
  }
  const { width } = engine
  let hard
  switch (true) {
    case successCnt < 5:
      hard = 0
      break
    case successCnt < 13:
      hard = 0.001
      break
    case successCnt < 23:
      hard = 0.002
      break
    default:
      hard = 0.003
      break
  }
  return Math.cos(time / 200) * hard * width
}

// ─────────────────────────────────────────────
// 钩子状态
// ─────────────────────────────────────────────

export const getHookStatus = (engine) => {
  if (engine.checkTimeMovement(constant.hookDownMovement)) {
    return constant.hookDown
  }
  if (engine.checkTimeMovement(constant.hookUpMovement)) {
    return constant.hookUp
  }
  return constant.hookNormal
}

// ─────────────────────────────────────────────
// 触控事件处理
// ─────────────────────────────────────────────

export const touchEventHandler = (engine) => {
  if (!engine.getVariable(constant.gameStartNow)) return
  if (engine.debug && engine.paused) return
  if (getHookStatus(engine) !== constant.hookNormal) return

  engine.removeInstance('tutorial-arrow')
  const b = engine.getInstance(`block_${engine.getVariable(constant.blockCount)}`)
  if (b && b.status === constant.swing) {
    engine.setTimeMovement(constant.hookUpMovement, 500)
    b.status = constant.beforeDrop
  }
}

// ─────────────────────────────────────────────
// 计分系统
// ─────────────────────────────────────────────

/**
 * 成功落地计数
 */
export const addSuccessCount = (engine) => {
  const { setGameSuccess } = engine.getVariable(constant.gameUserOption)
  const lastSuccessCount = engine.getVariable(constant.successCount)
  const success = lastSuccessCount + 1
  engine.setVariable(constant.successCount, success)

  // 记录到最近N块（成功）
  _recordBlock(engine, 'success')

  if (engine.getVariable(constant.hardMode)) {
    engine.setVariable(constant.ropeHeight, engine.height * engine.utils.random(0.35, 0.55))
  }
  if (setGameSuccess) setGameSuccess(success)
}

/**
 * 计分：基础25 + 连击加成25/次
 * 完美落地：额外+25（相当于 successScore + perfectScore * comboCount）
 * 技术方案 §2.6
 */
export const addScore = (engine, isPerfect) => {
  const { setGameScore, successScore, perfectScore } = engine.getVariable(constant.gameUserOption)
  const lastPerfectCount = engine.getVariable(constant.perfectCount) || 0
  const lastGameScore = engine.getVariable(constant.gameScore)
  const perfect = isPerfect ? lastPerfectCount + 1 : 0
  const score = lastGameScore
    + (successScore || 25)
    + ((perfectScore || 25) * perfect)
  engine.setVariable(constant.gameScore, score)
  engine.setVariable(constant.perfectCount, perfect)

  // 完美落地：触发闪光动画标记
  if (isPerfect) {
    engine.setVariable(constant.perfectFlash, { time: Date.now(), combo: perfect })
  }

  if (setGameScore) setGameScore(score)
}

// ─────────────────────────────────────────────
// 生命值系统
// ─────────────────────────────────────────────

/**
 * 失误计数，3次失误 → 游戏结束
 * 技术方案 §2.7
 */
export const addFailedCount = (engine) => {
  const { setGameFailed } = engine.getVariable(constant.gameUserOption)
  const lastFailedCount = engine.getVariable(constant.failedCount)
  const failed = lastFailedCount + 1
  engine.setVariable(constant.failedCount, failed)
  engine.setVariable(constant.perfectCount, 0)

  // 记录到最近N块（失误）
  _recordBlock(engine, 'fail')

  if (setGameFailed) setGameFailed(failed)

  // 最后1条命（failed === maxLives - 1 = 2）→ 触发复活币预提示，不消耗复活币
  if (failed === constant.maxLives - 1) {
    _triggerRevivePrompt(engine, 'warning')
    return
  }

  // 最后一条命也失去（failed >= maxLives）→ 触发最终复活/结算弹窗
  if (failed >= constant.maxLives) {
    engine.pauseAudio('bgm')
    engine.playAudio('game-over')
    engine.setVariable(constant.gameStartNow, false)
    engine.setVariable(constant.gameOver, true)
    const lastScore = engine.getVariable(constant.gameScore)
    const successCnt = engine.getVariable(constant.successCount)
    _triggerRevivePrompt(engine, 'death', { score: lastScore, floor: successCnt, failed })
    console.log('game over, floor:', successCnt, 'score:', lastScore)
  }
}

/**
 * 复活：恢复1条命（每局最多2次），不恢复积木宽度（公平性）
 * 技术方案 §4.1
 */
export const revive = (engine) => {
  const reviveCnt = (engine.getVariable(constant.reviveCount) || 0) + 1
  if (reviveCnt > constant.maxRevivePerGame) {
    console.warn('已达到本局最大复活次数')
    return false
  }
  engine.setVariable(constant.reviveCount, reviveCnt)

  const failed = engine.getVariable(constant.failedCount) - 1
  engine.setVariable(constant.failedCount, Math.max(0, failed))
  engine.setVariable(constant.gameStartNow, true)
  engine.setVariable(constant.gameOver, false)
  engine.playAudio('bgm', true)
  return true
}

// ─────────────────────────────────────────────
// 私有辅助
// ─────────────────────────────────────────────

/**
 * 记录最近N块的结果（滑动窗口）
 */
function _recordBlock(engine, result) {
  const recent = (engine.getVariable(constant.recentBlocks) || []).slice()
  recent.push(result)
  if (recent.length > constant.recentBlocksWindow) {
    recent.shift()
  }
  engine.setVariable(constant.recentBlocks, recent)
}

/**
 * 触发复活弹窗（在外部 hook 实现 UI）
 */
function _triggerRevivePrompt(engine, mode = 'warning', payload = {}) {
  const { onRevivePrompt } = engine.getVariable(constant.gameUserOption)
  if (onRevivePrompt) {
    onRevivePrompt({
      reviveCount: engine.getVariable(constant.reviveCount) || 0,
      mode,
      ...payload,
    })
  }
}

// ─────────────────────────────────────────────
// 文字绘制工具
// ─────────────────────────────────────────────

export const drawYellowString = (engine, option) => {
  const {
    string, size, x, y, textAlign
  } = option
  const { ctx } = engine
  const fontName = 'wenxue'
  const fontSize = size
  const lineSize = fontSize * 0.1
  ctx.save()
  ctx.beginPath()
  const gradient = ctx.createLinearGradient(0, 0, 0, y)
  gradient.addColorStop(0, '#FAD961')
  gradient.addColorStop(1, '#F76B1C')
  ctx.fillStyle = gradient
  ctx.lineWidth = lineSize
  ctx.strokeStyle = '#FFF'
  ctx.textAlign = textAlign || 'center'
  ctx.font = `${fontSize}px ${fontName}`
  ctx.strokeText(string, x, y)
  ctx.fillText(string, x, y)
  ctx.restore()
}
