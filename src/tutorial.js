import { getHookStatus } from './utils'
import * as constant from './constant'

/**
 * 教程箭头 Action：位置随时间上下浮动，提示玩家点击
 * Phase 1 改造：首块静止等待点击；教程文字由 index.html overlay 层处理
 */
export const tutorialAction = (instance, engine, time) => {
  const { width, height } = engine
  const { name } = instance
  if (!instance.ready) {
    instance.ready = true
    const tutorialWidth = width * 0.2
    instance.updateWidth(tutorialWidth)
    instance.height = tutorialWidth * 0.46
    instance.x = engine.calWidth - instance.calWidth
    instance.y = height * 0.45
    if (name !== 'tutorial') {
      instance.y += instance.height * 1.2
    }
  }
  // 箭头上下浮动动画
  if (name !== 'tutorial') {
    instance.y += Math.cos(time / 200) * instance.height * 0.01
  }
}

export const tutorialPainter = (instance, engine) => {
  if (engine.checkTimeMovement(constant.tutorialMovement)) {
    return
  }
  if (getHookStatus(engine) !== constant.hookNormal) {
    return
  }

  const { ctx } = engine
  const { name } = instance
  const t = engine.getImg(name)
  ctx.drawImage(t, instance.x, instance.y, instance.width, instance.height)

  // 首块时额外绘制"点击屏幕"提示文字
  const successCnt = engine.getVariable(constant.successCount) || 0
  if (successCnt === 0) {
    ctx.save()
    ctx.font = `bold ${engine.width * 0.045}px Arial, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 2
    ctx.textAlign = 'center'
    const tipX = engine.width / 2
    const tipY = instance.y + instance.height + engine.height * 0.06
    ctx.strokeText('点击屏幕，让积木落下', tipX, tipY)
    ctx.fillText('点击屏幕，让积木落下', tipX, tipY)
    ctx.restore()
  }
}
