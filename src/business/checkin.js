/**
 * 打卡截图功能
 * PRD §6.1：40 层夜景、60 层星空出现"打卡"按钮
 *
 * 实现：
 * - 在 Canvas 上方叠加浮动按钮
 * - 点击时截取 Canvas 当前帧 → toDataURL → 引导保存/分享
 */

let _checkinBtn = null

/**
 * 在特定楼层显示打卡按钮
 * @param {number} floor - 当前楼层
 * @param {HTMLCanvasElement} canvas - 游戏 Canvas 元素
 */
export function checkAndShowCheckinButton(floor, canvas) {
  const CHECKIN_FLOORS = {
    40: { emoji: '🌙', label: '夜景打卡', color: '#3949AB' },
    60: { emoji: '⭐', label: '星空打卡', color: '#4A148C' },
  }

  const config = CHECKIN_FLOORS[floor]
  if (!config) return

  // 已显示则不重复创建
  if (_checkinBtn) return

  _showCheckinButton(config, canvas)
}

/**
 * 隐藏打卡按钮（游戏结束时调用）
 */
export function hideCheckinButton() {
  if (_checkinBtn && _checkinBtn.parentNode) {
    _checkinBtn.parentNode.removeChild(_checkinBtn)
  }
  _checkinBtn = null
}

function _showCheckinButton(config, canvas) {
  const btn = document.createElement('button')
  btn.style.cssText = `
    position: fixed;
    left: 50%;
    bottom: 80px;
    transform: translateX(-50%);
    background: linear-gradient(135deg, ${config.color}, ${config.color}cc);
    color: #FFF;
    border: 2px solid rgba(255,255,255,0.4);
    border-radius: 24px;
    padding: 10px 24px;
    font-size: 15px;
    font-weight: bold;
    font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    cursor: pointer;
    z-index: 1000;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    animation: tg-checkin-pulse 1.5s ease-in-out infinite alternate;
    white-space: nowrap;
  `
  btn.textContent = `${config.emoji} ${config.label}`

  // 脉冲动画
  if (!document.getElementById('tg-checkin-anim')) {
    const style = document.createElement('style')
    style.id = 'tg-checkin-anim'
    style.textContent = `
      @keyframes tg-checkin-pulse {
        from { transform: translateX(-50%) scale(1); box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
        to   { transform: translateX(-50%) scale(1.06); box-shadow: 0 6px 24px rgba(0,0,0,0.6); }
      }
    `
    document.head.appendChild(style)
  }

  btn.onclick = () => {
    _captureAndShare(canvas, config)
    hideCheckinButton()
  }

  document.body.appendChild(btn)
  _checkinBtn = btn

  // 8秒后自动消失（不打扰游戏）
  setTimeout(() => hideCheckinButton(), 8000)
}

/**
 * 截取 Canvas 并触发保存/分享
 */
function _captureAndShare(canvas, config) {
  if (!canvas) {
    console.warn('[Checkin] 无法找到 Canvas 元素')
    return
  }

  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    // 叠加打卡水印
    const stamped = _addCheckinStamp(dataUrl, config)
    stamped.then(url => {
      // 优先 Web Share API
      if (navigator.share) {
        // 将 dataURL 转 Blob 再分享
        _dataUrlToBlob(url).then(blob => {
          const file = new File([blob], `tower-checkin-${config.label}.jpg`, { type: 'image/jpeg' })
          navigator.share({
            title: `无限盖楼 · ${config.label}`,
            text: `我在《无限盖楼》到达了${config.label}里程碑！`,
            files: [file],
          }).catch(() => _downloadDataUrl(url, `tower-${config.label}.jpg`))
        })
      } else {
        _downloadDataUrl(url, `tower-${config.label}.jpg`)
      }
    })
  } catch (err) {
    console.warn('[Checkin] 截图失败：', err)
  }
}

/**
 * 在截图上叠加打卡标记
 */
async function _addCheckinStamp(dataUrl, config) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)

      // 底部渐变蒙版
      const grad = ctx.createLinearGradient(0, c.height * 0.75, 0, c.height)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,0,0.65)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, c.width, c.height)

      // 打卡文字
      ctx.save()
      ctx.font = `bold ${c.width * 0.065}px Arial, sans-serif`
      ctx.fillStyle = '#FFD700'
      ctx.textAlign = 'center'
      ctx.fillText(`${config.emoji} ${config.label}`, c.width / 2, c.height * 0.9)
      ctx.font = `${c.width * 0.04}px Arial`
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText('无限盖楼 · 你的城市，你说了算', c.width / 2, c.height * 0.96)
      ctx.restore()

      resolve(c.toDataURL('image/jpeg', 0.92))
    }
    img.src = dataUrl
  })
}

function _downloadDataUrl(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

async function _dataUrlToBlob(dataUrl) {
  const resp = await fetch(dataUrl)
  return resp.blob()
}
