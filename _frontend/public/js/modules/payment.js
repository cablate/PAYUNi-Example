/**
 * 支付管理模組
 * 處理支付訂單建立與轉導
 */

export class PaymentManager {
  constructor(csrfToken, clientConfig) {
    this.csrfToken = csrfToken;
    this.clientConfig = clientConfig;
  }

  /**
   * 建立支付訂單
   * @param {string} productId - 商品 ID
   * @param {Array} products - 商品陣列
   * @returns {Promise<Object>} 支付資料物件
   * @throws {Error} 如果支付建立失敗
   */
  async createPayment(productId, products) {
    const product = products.find((p) => p.id === productId);
    if (!product) throw new Error("商品不存在");

    const turnstileToken = turnstile.getResponse();

    if (this.clientConfig.turnstileEnable && !turnstileToken) {
      throw new Error("請完成安全驗證");
    }

    // 根據商品類型選擇 API 端點
    const endpoint =
      product.type === "subscription" ? "/create-subscription" : "/create-payment";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": this.csrfToken,
      },
      body: JSON.stringify({
        productID: productId,
        turnstileToken: turnstileToken,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "支付建立失敗");

    return data;
  }

  /**
   * 重導至支付頁面
   * @param {Object} paymentData - 支付資料物件
   */
  redirectToPayment(paymentData) {
    const { payUrl, data } = paymentData;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = payUrl;

    Object.entries(data).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }
}
