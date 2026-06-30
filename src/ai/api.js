/**
 * 快手文生图 API 封装
 * 技术方案 §3.1 / §3.2
 *
 * 支持两种模式：
 *   - Mock 模式（AI_MOCK=true 或 option.aiMock=true）：返回本地降级背景图，不调用真实 API
 *   - 真实模式：调用快手内部文生图 API，3s 超时自动降级
 *
 * 配置项（通过 window.TowerGameConfig 或 option 注入）：
 *   aiEndpoint  - API 地址
 *   aiKey       - API Key
 *   aiMock      - 是否启用 Mock 模式
 */

const DEFAULT_TIMEOUT_MS = 3000

// 阶段降级背景（使用游戏自带的 background.png 按色调区分）
const FALLBACK_IMAGES = {
  day: './assets/bg/day.png',
  dusk: './assets/bg/dusk.png',
  night: './assets/bg/night.png',
  star: './assets/bg/star.png',
}

// Mock 模式：渐变 Canvas 生成占位图
function createMockImage(theme) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 700
    const ctx = canvas.getContext('2d')

    // 每个阶段用不同色调渐变
    const gradients = {
      day: ['#87CEEB', '#E0F7FA', '#FFFDE7'],
      dusk: ['#FF6F00', '#E65100', '#BF360C'],
      night: ['#1A237E', '#283593', '#0D47A1'],
      star: ['#0D0D2B', '#1A1A4B', '#2A2A6B'],
    }
    const stops = gradients[theme] || gradients.day
    const grad = ctx.createLinearGradient(0, 0, 0, 700)
    grad.addColorStop(0, stops[0])
    grad.addColorStop(0.5, stops[1])
    grad.addColorStop(1, stops[2])
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 400, 700)

    // 简单装饰
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * 400
      const y = Math.random() * 700
      const r = 20 + Math.random() * 60
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const img = new Image()
    img.onload = () => resolve(img)
    img.src = canvas.toDataURL('image/jpeg', 0.8)
  })
}

// 加载降级图片（文件路径）
function loadFallbackImage(theme) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      // 文件不存在时退化到 Mock 渐变图
      createMockImage(theme).then(resolve)
    }
    img.src = FALLBACK_IMAGES[theme] || FALLBACK_IMAGES.day
  })
}

/**
 * 调用快手文生图 API
 * @param {string} prompt - 生图提示词
 * @param {object} config - { aiEndpoint, aiKey }
 * @returns {Promise<HTMLImageElement>}
 */
async function callRealAPI(prompt, config) {
  const { aiEndpoint, aiKey } = config
  if (!aiEndpoint || !aiKey) {
    throw new Error('AI API 配置缺失：需要 aiEndpoint 和 aiKey')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const resp = await fetch(aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiKey}`,
      },
      body: JSON.stringify({ prompt, num_images: 1, format: 'jpeg' }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) throw new Error(`AI API 返回错误 ${resp.status}`)
    const data = await resp.json()
    // 假设接口返回 { images: [{ url: '...' }] }
    const url = data.images?.[0]?.url || data.data?.[0]?.url
    if (!url) throw new Error('AI API 返回图片 URL 为空')

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

/**
 * 生成城市背景图
 * @param {string} theme - 'day' | 'dusk' | 'night' | 'star'
 * @param {object} config - 来自 window.TowerGameConfig 或 option
 * @returns {Promise<HTMLImageElement>}
 */
export async function generateBackground(theme, config = {}) {
  const isMock = config.aiMock || !config.aiEndpoint

  if (isMock) {
    // Mock 模式：返回渐变占位图
    return createMockImage(theme)
  }

  const prompts = {
    day: 'city skyline, daytime, clear sky, bright, photorealistic, 4k',
    dusk: 'city at sunset, golden hour, warm light, dramatic sky, photorealistic',
    night: 'city at night, neon lights, reflections, bokeh, photorealistic',
    star: 'city above clouds, starry sky, milky way, dramatic, photorealistic',
  }

  try {
    return await callRealAPI(prompts[theme] || prompts.day, config)
  } catch (err) {
    console.warn(`[AI] 生图失败（${theme}），降级到静态图：`, err.message)
    return loadFallbackImage(theme)
  }
}

export default { generateBackground }
