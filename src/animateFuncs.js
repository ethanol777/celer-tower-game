import { Instance } from 'cooljs'
import { blockAction, blockPainter } from './block'
import {
  checkMoveDown,
  getMoveDownValue,
  drawYellowString,
  getAngleBase
} from './utils'
import { addFlight } from './flight'
import * as constant from './constant'

/**
 * 每帧绘制 HUD（生命值、分数、楼层、连击）
 * Phase 1 改造：补充连击显示和完美落地闪光特效
 */
export const endAnimate = (engine) => {
  const gameStartNow = engine.getVariable(constant.gameStartNow)
  if (!gameStartNow) return

  const successCount = engine.getVariable(constant.successCount, 0)
  const failedCount = engine.getVariable(constant.failedCount)
  const gameScore = engine.getVariable(constant.gameScore, 0)
  const perfectCount = engine.getVariable(constant.perfectCount, 0)
  const threeFiguresOffset = Number(successCount) > 99 ? engine.width * 0.1 : 0

  // ── 完美落地闪光特效 ──
  const flash = engine.getVariable(constant.perfectFlash)
  if (flash) {
    const elapsed = Date.now() - flash.time
    if (elapsed < 300) {
      const alpha = (1 - elapsed / 300) * 0.45
      engine.ctx.save()
      engine.ctx.fillStyle = `rgba(255, 240, 80, ${alpha})`
      engine.ctx.fillRect(0, 0, engine.width, engine.height)
      engine.ctx.restore()
    } else {
      engine.setVariable(constant.perfectFlash, null)
    }
  }

  // ── 楼层（左上角） ──
  drawYellowString(engine, {
    string: 'F',
    size: engine.width * 0.06,
    x: (engine.width * 0.24) + threeFiguresOffset,
    y: engine.width * 0.12,
    textAlign: 'left'
  })
  drawYellowString(engine, {
    string: successCount,
    size: engine.width * 0.17,
    x: (engine.width * 0.22) + threeFiguresOffset,
    y: engine.width * 0.2,
    textAlign: 'right'
  })

  // ── 分数（右上角） ──
  const score = engine.getImg('score')
  const scoreWidth = score.width
  const scoreHeight = score.height
  const zoomedWidth = engine.width * 0.35
  const zoomedHeight = (scoreHeight * zoomedWidth) / scoreWidth
  engine.ctx.drawImage(
    score,
    engine.width * 0.61,
    engine.width * 0.038,
    zoomedWidth,
    zoomedHeight
  )
  drawYellowString(engine, {
    string: gameScore,
    size: engine.width * 0.06,
    x: engine.width * 0.9,
    y: engine.width * 0.095,
    textAlign: 'right'
  })

  // ── 连击提示（分数下方，连击>=2时显示） ──
  if (perfectCount >= 2) {
    const { ctx } = engine
    ctx.save()
    ctx.font = `bold ${engine.width * 0.038}px Arial, sans-serif`
    ctx.fillStyle = '#FFD700'
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = 2
    ctx.textAlign = 'right'
    const comboStr = `🔥 ×${perfectCount} COMBO`
    ctx.strokeText(comboStr, engine.width * 0.96, engine.width * 0.135)
    ctx.fillText(comboStr, engine.width * 0.96, engine.width * 0.135)
    ctx.restore()
  }

  // ── 生命值心形图标（右侧中部，已扣变灰） ──
  const { ctx } = engine
  const heart = engine.getImg('heart')
  const heartWidth = heart.width
  const heartHeight = heart.height
  const zoomedHeartWidth = engine.width * 0.08
  const zoomedHeartHeight = (heartHeight * zoomedHeartWidth) / heartWidth
  for (let i = 1; i <= constant.maxLives; i += 1) {
    ctx.save()
    if (i <= failedCount) {
      ctx.globalAlpha = 0.2
    }
    ctx.drawImage(
      heart,
      (engine.width * 0.66) + ((i - 1) * zoomedHeartWidth),
      engine.width * 0.16,
      zoomedHeartWidth,
      zoomedHeartHeight
    )
    ctx.restore()
  }
}

/**
 * 每帧主循环：生成新积木、触发装饰动画
 */
export const startAnimate = (engine) => {
  const gameStartNow = engine.getVariable(constant.gameStartNow)
  if (!gameStartNow) return

  const lastBlock = engine.getInstance(`block_${engine.getVariable(constant.blockCount)}`)
  if (!lastBlock || [constant.land, constant.out].indexOf(lastBlock.status) > -1) {
    if (checkMoveDown(engine) && getMoveDownValue(engine)) return
    if (engine.checkTimeMovement(constant.hookUpMovement)) return
    const angleBase = getAngleBase(engine)
    const initialAngle = (Math.PI
        * engine.utils.random(angleBase, angleBase + 5)
        * engine.utils.randomPositiveNegative()
    ) / 180
    engine.setVariable(constant.blockCount, engine.getVariable(constant.blockCount) + 1)
    engine.setVariable(constant.initialAngle, initialAngle)
    engine.setTimeMovement(constant.hookDownMovement, 500)
    const block = new Instance({
      name: `block_${engine.getVariable(constant.blockCount)}`,
      action: blockAction,
      painter: blockPainter
    })
    engine.addInstance(block)
  }

  const successCount = Number(engine.getVariable(constant.successCount, 0))
  switch (successCount) {
    case 2:
      addFlight(engine, 1, 'leftToRight')
      break
    case 6:
      addFlight(engine, 2, 'rightToLeft')
      break
    case 8:
      addFlight(engine, 3, 'leftToRight')
      break
    case 14:
      addFlight(engine, 4, 'bottomToTop')
      break
    case 18:
      addFlight(engine, 5, 'bottomToTop')
      break
    case 22:
      addFlight(engine, 6, 'bottomToTop')
      break
    case 25:
      addFlight(engine, 7, 'rightTopToLeft')
      break
    default:
      break
  }
}
