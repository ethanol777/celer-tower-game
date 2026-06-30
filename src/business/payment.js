/**
 * 付费服务
 * 技术方案 §4.1
 *
 * MVP 阶段：paymentService.buy() 直接 Mock 成功
 * 接入真实支付时替换 _realPay() 实现即可
 *
 * SKU 列表：
 *   card_single_1yuan   - 结算卡片单次 ¥1
 *   card_monthly_12yuan - 结算卡片月卡 ¥12
 *   theme_dusk          - 黄昏霓虹主题包 ¥6
 *   theme_star          - 星空悬城主题包 ¥6
 *   theme_cyberpunk     - 赛博朋克主题包 ¥8
 *   theme_all           - 全主题包 ¥18
 *   revive_coin_1       - 复活币×1 ¥1
 *   revive_coin_5       - 复活币×5 ¥4
 *   revive_coin_15      - 复活币×15 ¥10
 */

import { store } from './store'

const SKU_PRICES = {
  card_single_1yuan: { name: '高清卡片（单次）', price: 1 },
  card_monthly_12yuan: { name: '高清卡片（月卡）', price: 12 },
  theme_dusk: { name: '黄昏霓虹主题包', price: 6, theme: 'dusk' },
  theme_star: { name: '星空悬城主题包', price: 6, theme: 'star' },
  theme_cyberpunk: { name: '赛博朋克主题包', price: 8, theme: 'cyberpunk' },
  theme_all: { name: '全主题包', price: 18, themes: ['dusk', 'star', 'cyberpunk'] },
  revive_coin_1: { name: '复活币×1', price: 1, coins: 1 },
  revive_coin_5: { name: '复活币×5', price: 4, coins: 5 },
  revive_coin_15: { name: '复活币×15', price: 10, coins: 15 },
}

export const paymentService = {
  /**
   * 发起购买
   * @param {string} sku
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async buy(sku) {
    const skuInfo = SKU_PRICES[sku]
    if (!skuInfo) {
      return { success: false, message: `未知商品 ${sku}` }
    }

    try {
      // TODO: MVP 阶段 Mock 成功，真实接入时替换为 _realPay()
      const result = await this._mockPay(skuInfo)
      if (result.success) {
        this._fulfill(sku, skuInfo)
      }
      return result
    } catch (err) {
      return { success: false, message: '支付异常，请重试' }
    }
  },

  /**
   * Mock 支付（始终成功）
   */
  async _mockPay(skuInfo) {
    // 模拟网络延迟
    await new Promise(r => setTimeout(r, 300))
    console.log(`[Payment Mock] 购买成功：${skuInfo.name} ¥${skuInfo.price}`)
    return { success: true, message: '购买成功' }
  },

  /**
   * 真实支付（待接入）
   */
  async _realPay(skuInfo) {
    // TODO: 调用快手内部支付 SDK 或微信支付
    throw new Error('真实支付未接入，请配置 paymentService._realPay')
  },

  /**
   * 发货（根据 SKU 更新本地数据）
   */
  _fulfill(sku, skuInfo) {
    if (skuInfo.theme) {
      store.unlockTheme(skuInfo.theme)
    }
    if (skuInfo.themes) {
      skuInfo.themes.forEach(t => store.unlockTheme(t))
    }
    // 复活币是单局内道具，由游戏引擎变量 REVIVE_COINS 管理，不写入 localStorage
    console.log(`[Payment] 发货完成：${sku}`)
  },
}
