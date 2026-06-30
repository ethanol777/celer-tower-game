import { Engine, Instance } from 'cooljs'
import { touchEventHandler, revive } from './utils'
import { background } from './background'
import { lineAction, linePainter } from './line'
import { cloudAction, cloudPainter } from './cloud'
import { hookAction, hookPainter } from './hook'
import { tutorialAction, tutorialPainter } from './tutorial'
import * as constant from './constant'
import { startAnimate, endAnimate } from './animateFuncs'

// AI 模块
import { getAIBackgroundManager } from './ai/background'

// 业务模块
import {
  showSettlementPage,
  showThemePackModal,
  showReviveModal,
  showReviveCountdown,
  cardGenerator,
} from './business/settlement'
import { checkAndShowCheckinButton, hideCheckinButton } from './business/checkin'

/**
 * 无限盖楼游戏主入口
 *
 * option 配置项（可在 index.html 中注入）：
 *   canvasId       - Canvas 元素 ID（默认 'canvas'）
 *   width / height - 画布尺寸
 *   soundOn        - 是否开启音效
 *   aiMock         - 是否使用 Mock AI 图片（默认 true）
 *   aiEndpoint     - 快手文生图 API 地址
 *   aiKey          - API Key
 *   hookSpeed      - 自定义摆速函数 (successCount, score) => number
 *   hookAngle      - 自定义摆角函数
 *   successScore   - 成功得分（默认 25）
 *   perfectScore   - 完美额外得分（默认 25）
 *   onGameOver     - 游戏结束回调 ({ score, floor, failed })
 *   onRevivePrompt - 复活弹窗回调
 */
window.TowerGame = (option = {}) => {
  const {
    width,
    height,
    canvasId,
    soundOn,
    aiMock = true,
    aiEndpoint,
    aiKey,
  } = option

  const aiConfig = { aiMock, aiEndpoint, aiKey }

  const game = new Engine({
    canvasId: canvasId || 'canvas',
    highResolution: true,
    width,
    height,
    soundOn
  })

  const pathGenerator = (path) => `./assets/${path}`

  // ── 资源加载 ──
  game.addImg('background', pathGenerator('background.png'))
  game.addImg('hook', pathGenerator('hook.png'))
  game.addImg('blockRope', pathGenerator('block-rope.png'))
  game.addImg('block', pathGenerator('block.png'))
  game.addImg('block-perfect', pathGenerator('block-perfect.png'))
  for (let i = 1; i <= 8; i += 1) {
    game.addImg(`c${i}`, pathGenerator(`c${i}.png`))
  }
  game.addLayer(constant.flightLayer)
  for (let i = 1; i <= 7; i += 1) {
    game.addImg(`f${i}`, pathGenerator(`f${i}.png`))
  }
  game.swapLayer(0, 1)
  game.addImg('tutorial', pathGenerator('tutorial.png'))
  game.addImg('tutorial-arrow', pathGenerator('tutorial-arrow.png'))
  game.addImg('heart', pathGenerator('heart.png'))
  game.addImg('score', pathGenerator('score.png'))
  game.addAudio('drop-perfect', pathGenerator('drop-perfect.mp3'))
  game.addAudio('drop', pathGenerator('drop.mp3'))
  game.addAudio('game-over', pathGenerator('game-over.mp3'))
  game.addAudio('rotate', pathGenerator('rotate.mp3'))
  game.addAudio('bgm', pathGenerator('bgm.mp3'))

  // ── 状态初始化 ──
  game.setVariable(constant.blockWidth, game.width * 0.25)
  game.setVariable(constant.blockHeight, game.getVariable(constant.blockWidth) * 0.71)
  game.setVariable(constant.cloudSize, game.width * 0.3)
  game.setVariable(constant.ropeHeight, game.height * 0.4)
  game.setVariable(constant.blockCount, 0)
  game.setVariable(constant.successCount, 0)
  game.setVariable(constant.failedCount, 0)
  game.setVariable(constant.gameScore, 0)
  game.setVariable(constant.perfectCount, 0)
  game.setVariable(constant.hardMode, false)
  game.setVariable(constant.reviveCount, 0)
  game.setVariable(constant.reviveCoins, 0)
  game.setVariable(constant.recentBlocks, [])
  game.setVariable(constant.gameOver, false)
  game.setVariable(constant.perfectFlash, null)

  // ── AI 背景管理器 ──
  const aiBackground = getAIBackgroundManager(aiConfig)
  // 游戏加载期间预生成前两个阶段背景图
  aiBackground.preload()

  // ── option Hook 注入 ──
  const enhancedOption = {
    ...option,

    // 每层成功：切换背景 + 主题包引导 + 打卡截图
    setGameSuccess: (successCnt) => {
      // 每 10 层切换 AI 背景
      if (successCnt % 10 === 0 && successCnt > 0) {
        aiBackground.switchBackground(successCnt)
      }

      // 里程碑：主题包引导（20/40/60 层）
      if ([20, 40, 60].includes(successCnt)) {
        const bgImg = aiBackground.getHighestLayerBg(successCnt)
        showThemePackModal(successCnt, bgImg, (theme) => {
          // 购买成功后立即切换背景
          aiBackground.switchBackground(successCnt)
          console.log(`[Theme] 已解锁：${theme}`)
        })
      }

      // 打卡截图按钮（40层夜景 / 60层星空）
      if ([40, 60].includes(successCnt)) {
        const canvasEl = document.getElementById('canvas')
        checkAndShowCheckinButton(successCnt, canvasEl)
      }

      // 快结束时（第28块起）预生成结算卡片
      if (successCnt >= 28 && !cardGenerator.freeCard) {
        const bgImg = aiBackground.getHighestLayerBg(successCnt)
        cardGenerator.generate(
          {
            floor: successCnt,
            score: game.getVariable(constant.gameScore),
            perfectCombo: game.getVariable(constant.perfectCount),
          },
          bgImg,
          aiConfig
        )
      }

      if (option.setGameSuccess) option.setGameSuccess(successCnt)
    },

    // 失误时：复活弹窗
    setGameFailed: (failedCnt) => {
      if (option.setGameFailed) option.setGameFailed(failedCnt)
    },

    // 游戏结束：结算页
    onGameOver: ({ score, floor, failed }) => {
      // 游戏结束时隐藏打卡按钮
      hideCheckinButton()
      const bgImg = aiBackground.getHighestLayerBg(floor)
      const perfectCombo = game.getVariable(constant.perfectCount)

      showSettlementPage({
        stats: { floor, score, perfectCombo },
        bgImg,
        aiConfig,
        onRestart: () => {
          restartGame(game)
        }
      })

      if (option.onGameOver) option.onGameOver({ score, floor, failed })
    },

    // 复活弹窗：warning=仅剩一命预提示；death=最后一命失去后的复活/结算
    onRevivePrompt: ({ reviveCount: rCount, mode, score, floor, failed }) => {
      if (mode === 'death' && rCount >= constant.maxRevivePerGame) {
        if (enhancedOption.onGameOver) {
          enhancedOption.onGameOver({ score, floor, failed })
        }
        return
      }

      showReviveModal({
        mode,
        reviveCoins: game.getVariable(constant.reviveCoins) || 0,
        onBuyReviveCoin: (count = 1) => {
          const current = game.getVariable(constant.reviveCoins) || 0
          game.setVariable(constant.reviveCoins, current + count)
        },
        onUseReviveCoin: () => {
          const current = game.getVariable(constant.reviveCoins) || 0
          game.setVariable(constant.reviveCoins, Math.max(0, current - 1))
        },
        // 弹窗打开时立即暂停，避免点击购买/复活按钮那一下穿透触发落块
        onOpen: () => {
          game.setVariable(constant.gameStartNow, false)
        },
        // warning 模式：倒计时结束 / 右上角关闭 / 购买成功后，继续游戏
        onContinue: () => {
          game.setVariable(constant.gameStartNow, true)
          game.playAudio('bgm', true)
        },
        // death 模式：购买/使用复活币后，显示3秒倒计时，结束后复活
        onRevive: () => {
          showReviveCountdown(() => {
            reviveAfterDeath(game)
          })
        },
        // death 模式：倒计时结束 / 右上角关闭后结算
        onGiveUp: () => {
          game.pauseAudio('bgm')
          game.playAudio('game-over')
          game.setVariable(constant.gameStartNow, false)
          game.setVariable(constant.gameOver, true)
          if (enhancedOption.onGameOver) {
            enhancedOption.onGameOver({ score, floor, failed: failed || constant.maxLives })
          }
        }
      })
    },
  }

  game.setVariable(constant.gameUserOption, enhancedOption)

  // ── 场景实例 ──
  for (let i = 1; i <= 4; i += 1) {
    const cloud = new Instance({
      name: `cloud_${i}`,
      action: cloudAction,
      painter: cloudPainter
    })
    cloud.index = i
    cloud.count = 5 - i
    game.addInstance(cloud)
  }

  const line = new Instance({
    name: 'line',
    action: lineAction,
    painter: linePainter
  })
  game.addInstance(line)

  const hook = new Instance({
    name: 'hook',
    action: hookAction,
    painter: hookPainter
  })
  game.addInstance(hook)

  // ── 游戏循环钩子 ──
  game.startAnimate = startAnimate
  game.endAnimate = (engine) => {
    endAnimate(engine)
    // 叠加 AI 背景（在普通背景之上）
    // 注意：AI 背景绘制已通过 background.js 的 paintUnderInstance 处理
  }

  // paintUnderInstance：先绘制原始渐变背景 + AI 图片
  game.paintUnderInstance = (engine) => {
    background(engine)
    // 在渐变背景之上叠加 AI 生成图（半透明融合）
    if (aiBackground.currentImg) {
      const { ctx, width: w, height: h } = engine
      ctx.save()
      ctx.globalAlpha = 0.55  // 与渐变背景融合
      aiBackground.render(ctx, w, h)
      ctx.restore()
    }
  }

  game.addKeyDownListener('enter', () => {
    if (game.debug) game.togglePaused()
  })

  game.touchStartListener = () => {
    touchEventHandler(game)
  }

  game.playBgm = () => {
    game.playAudio('bgm', true)
  }

  game.pauseBgm = () => {
    game.pauseAudio('bgm')
  }

  game.start = () => {
    startNewRound(game)
  }

  return game
}

/**
 * 初始化新一局的教程和首块生成计时。
 */
function startNewRound(game) {
  // 每局开始时没有复活币；购买的复活币只在本局内生效
  game.setVariable(constant.reviveCoins, 0)

  const tutorialArrow = new Instance({
    name: 'tutorial-arrow',
    action: tutorialAction,
    painter: tutorialPainter
  })
  game.addInstance(tutorialArrow)
  game.setTimeMovement(constant.bgInitMovement, 500)
  game.setTimeMovement(constant.tutorialMovement, 500)
  game.setVariable(constant.gameStartNow, true)
}

/**
 * 最后一命失去后的复活：清理失败块并重置吊钩运动，避免复活后只有背景无绳子/积木。
 */
function reviveAfterDeath(game) {
  game.setVariable(constant.gameStartNow, false)

  const currentBlockIndex = game.getVariable(constant.blockCount) || 0
  const failedBlockName = `block_${currentBlockIndex}`
  game.removeInstance(failedBlockName)
  game.setVariable(constant.blockCount, Math.max(0, currentBlockIndex - 1))

  // 清理死亡前残留的吊钩/落块运动，避免 startAnimate 被旧 movement 卡住
  delete game.timeMovement[constant.hookDownMovement]
  delete game.timeMovement[constant.hookUpMovement]
  delete game.timeMovement[constant.moveDownMovement]
  game.timeMovementStartArr = game.timeMovementStartArr.filter(name => (
    name !== constant.hookDownMovement &&
    name !== constant.hookUpMovement &&
    name !== constant.moveDownMovement
  ))
  game.timeMovementFinishArr = game.timeMovementFinishArr.filter(name => (
    name !== constant.hookDownMovement &&
    name !== constant.hookUpMovement &&
    name !== constant.moveDownMovement
  ))

  // 重置吊钩位置；line 保留在上一块成功落点，用于从当前楼层继续
  const hook = game.getInstance('hook')
  if (hook) {
    hook.ready = false
    hook.visible = true
    hook.x = 0
    hook.y = 0
    hook.angle = 0
    hook.weightX = 0
    hook.weightY = 0
  }

  revive(game)
}

/**
 * 结算页「再来一局」：完整清理上一局残留实例和运动状态。
 * 只重置变量会留下旧 block / flight / timeMovement，导致绳子和积木撕裂、绳子消失。
 */
function restartGame(game) {
  game.setVariable(constant.gameStartNow, false)

  // 清理上一局生成的动态实例
  game.instancesObj[game.defaultLayer] = game.instancesObj[game.defaultLayer].filter((instance) => {
    return !(/^block_/.test(instance.name) || instance.name === 'tutorial-arrow')
  })
  game.instancesObj[constant.flightLayer] = []
  game.instancesReactionArr = game.instancesReactionArr.filter((instance) => {
    return !(/^block_/.test(instance.name) || instance.name === 'tutorial-arrow')
  })

  // 重置基础场景实例，让 hook/line/cloud 在下一帧重新初始化坐标
  ;['line', 'hook', 'cloud_1', 'cloud_2', 'cloud_3', 'cloud_4'].forEach((name) => {
    const instance = game.getInstance(name)
    if (instance) {
      instance.ready = false
      instance.x = 0
      instance.y = 0
      instance.angle = 0
      instance.visible = true
      instance.ax = 0
      instance.ay = 0
    }
  })

  // 清空所有缓动/运动计时，避免旧 hookDown/hookUp/moveDown 继续影响新局
  game.timeMovement = {}
  game.timeMovementStartArr = []
  game.timeMovementFinishArr = []

  // 重置核心变量
  game.setVariable(constant.blockWidth, game.width * 0.25)
  game.setVariable(constant.blockHeight, game.getVariable(constant.blockWidth) * 0.71)
  game.setVariable(constant.cloudSize, game.width * 0.3)
  game.setVariable(constant.ropeHeight, game.height * 0.4)
  game.setVariable(constant.blockCount, 0)
  game.setVariable(constant.successCount, 0)
  game.setVariable(constant.failedCount, 0)
  game.setVariable(constant.gameScore, 0)
  game.setVariable(constant.perfectCount, 0)
  game.setVariable(constant.reviveCount, 0)
  game.setVariable(constant.recentBlocks, [])
  game.setVariable(constant.gameOver, false)
  game.setVariable(constant.hardMode, false)
  game.setVariable(constant.perfectFlash, null)
  game.setVariable(constant.initialAngle, 0)
  game.setVariable(constant.flightCount, 0)

  // 重置背景/基座偏移：上一局楼体下移会把基座推到屏幕外，必须恢复到初始态
  game.setVariable(constant.bgImgOffset, null)
  game.setVariable(constant.bgLinearGradientOffset, 0)
  game.setVariable(constant.lineInitialOffset, null)

  game.playAudio('bgm', true)
  startNewRound(game)
}
