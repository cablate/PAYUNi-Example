/**
 * 主應用程式進入點
 * 整合所有模組並初始化應用
 */

import { AuthManager } from "./modules/auth.js";
import { ProductManager } from "./modules/products.js";
import { PaymentManager } from "./modules/payment.js";
import {
  showLoading,
  hideLoading,
  showError,
  clearError,
} from "./modules/ui.js";

// Turnstile Callback
window.onTurnstileSuccess = function (token) {
  // 可選：在安全驗證成功時自動啟用功能
  // 目前只在支付按鈕點擊時檢查 turnstile.getResponse()
};

document.addEventListener("DOMContentLoaded", async () => {
  // ===== DOM 元素集合 =====
  const elements = {
    // 商品相關
    productOptionsEl: document.getElementById("product-options"),
    totalAmountEl: document.getElementById("total-amount"),

    // 支付相關
    payBtn: document.getElementById("pay-btn"),

    // 錯誤訊息與載入
    errorEl: document.getElementById("error-message"),
    loadingModal: document.getElementById("loading-modal"),

    // 區段
    authSection: document.getElementById("auth-section"),
    planSection: document.getElementById("plan-section"),
    paymentSection: document.getElementById("payment-section"),

    // 認證檢視
    guestView: document.getElementById("guest-view"),
    userView: document.getElementById("user-view"),
    loginBtn: document.getElementById("login-btn"),

    // 使用者資訊
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    logoutBtn: document.getElementById("logout-btn"),

    // 訂單歷史
    myOrdersBtn: document.getElementById("my-orders-btn"),
    orderHistoryModal: document.getElementById("order-history-modal"),
    closeOrderModalBtn: document.getElementById("close-order-modal-btn"),
    orderHistoryBody: document.getElementById("order-history-body"),
    noOrdersMessage: document.getElementById("no-orders-message"),
  };

  // ===== 狀態管理 =====
  let csrfToken = "";
  let clientConfig = {};

  // ===== 管理器初始化 =====
  const authManager = new AuthManager();
  const productManager = new ProductManager();
  let paymentManager;

  // ===== 事件處理函數 =====

  /**
   * 更新支付金額顯示
   */
  function updatePaymentAmount(productId) {
    const product = productManager.getSelectedProduct();
    if (product && elements.totalAmountEl) {
      elements.totalAmountEl.textContent = `$${product.price}`;
    }
  }

  /**
   * 啟用支付步驟
   */
  function enablePaymentStep() {
    if (elements.paymentSection) {
      elements.paymentSection.classList.remove("disabled");
    }
    if (elements.payBtn) {
      elements.payBtn.disabled = false;
    }
  }

  /**
   * 禁用支付步驟
   */
  function disablePaymentStep() {
    if (elements.paymentSection) {
      elements.paymentSection.classList.add("disabled");
    }
    if (elements.payBtn) {
      elements.payBtn.disabled = true;
    }
  }

  /**
   * 處理支付按鈕點擊
   */
  async function handlePayment() {
    const user = authManager.getCurrentUser();
    if (!user || !productManager.selectedProductId) return;

    try {
      clearError();
      if (elements.payBtn) {
        elements.payBtn.disabled = true;
      }
      showLoading();

      const paymentData = await paymentManager.createPayment(
        productManager.selectedProductId,
        productManager.products
      );

      paymentManager.redirectToPayment(paymentData);
    } catch (error) {
      console.error(error);
      showError(error.message || "支付建立失敗");
      if (elements.payBtn) {
        elements.payBtn.disabled = false;
      }
    }
  }

  /**
   * 處理商品選擇
   */
  function handleProductSelection(productId) {
    productManager.selectProduct(productId);
    productManager.renderProducts(elements.productOptionsEl, authManager.getCurrentUser());
    updatePaymentAmount(productId);
    enablePaymentStep();
  }

  /**
   * 處理標籤切換
   */
  function handleTabSwitch(tab) {
    productManager.setTab(tab);
    productManager.renderProducts(elements.productOptionsEl, authManager.getCurrentUser());
    disablePaymentStep();
  }

  /**
   * 顯示訂單歷史
   */
  async function handleShowOrderHistory() {
    showLoading();
    try {
      const res = await fetch("/api/my-orders");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);

      // 渲染表格
      if (elements.orderHistoryBody) {
        elements.orderHistoryBody.innerHTML = "";
        if (data.orders && data.orders.length > 0) {
          if (elements.noOrdersMessage) {
            elements.noOrdersMessage.classList.add("hidden");
          }
          data.orders.forEach((order) => {
            const row = document.createElement("tr");
            row.innerHTML = `
              <td>${new Date(order.createdAt).toLocaleDateString()}</td>
              <td>${order.productName || "License"}</td>
              <td>$${order.tradeAmt}</td>
              <td><span class="status-badge status-${order.status.toLowerCase()}">${order.status}</span></td>
            `;
            elements.orderHistoryBody.appendChild(row);
          });
        } else {
          if (elements.noOrdersMessage) {
            elements.noOrdersMessage.classList.remove("hidden");
          }
        }
      }
      if (elements.orderHistoryModal) {
        elements.orderHistoryModal.classList.remove("hidden");
      }
    } catch (e) {
      showError(e.message);
    } finally {
      hideLoading();
    }
  }

  /**
   * 隱藏訂單歷史模態
   */
  function handleCloseOrderModal() {
    if (elements.orderHistoryModal) {
      elements.orderHistoryModal.classList.add("hidden");
    }
  }

  // ===== 初始化 =====

  /**
   * 初始化應用程式
   */
  async function init() {
    showLoading();

    try {
      // 平行獲取 CSRF Token 和客戶端設定
      const [csrfRes, configRes] = await Promise.all([
        fetch("/csrf-token"),
        fetch("/api/client-config"),
      ]);

      if (csrfRes.ok) {
        const data = await csrfRes.json();
        csrfToken = data.csrfToken;
      }

      if (configRes.ok) {
        clientConfig = await configRes.json();
      }

      // 初始化支付管理器
      paymentManager = new PaymentManager(csrfToken, clientConfig);

      // 檢查使用者登入狀態
      const user = await authManager.checkLoginStatus();

      // 載入商品列表
      await productManager.fetchProducts();

      // 更新 UI
      authManager.updateUI(user, elements, () => {
        // 如果已有使用者且已選擇商品，則啟用支付步驟
        if (user && productManager.selectedProductId) {
          enablePaymentStep();
        }
      });

      productManager.renderProducts(
        elements.productOptionsEl,
        authManager.getCurrentUser()
      );
    } catch (error) {
      console.error("初始化失敗", error);
      showError("應用程式初始化失敗，請重新整理頁面");
    } finally {
      hideLoading();
    }
  }

  // ===== 事件監聽器綁定 =====

  // 支付按鈕
  if (elements.payBtn) {
    elements.payBtn.addEventListener("click", handlePayment);
  }

  // 登入按鈕
  if (elements.loginBtn) {
    elements.loginBtn.addEventListener("click", () => {
      elements.loginBtn.classList.add("loading");
      window.location.href = "/auth/google";
    });
  }

  // 標籤切換
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      // 更新標籤 UI
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");

      // 更新狀態並重新渲染
      handleTabSwitch(e.target.dataset.tab);
    });
  });

  // 商品選擇（代理事件處理）
  if (elements.productOptionsEl) {
    elements.productOptionsEl.addEventListener("click", (e) => {
      const card = e.target.closest(
        ".plan-option, .product-card-horizontal"
      );
      if (card && card.dataset.id) {
        handleProductSelection(card.dataset.id);
      }
    });
  }

  // 訂單歷史
  if (elements.myOrdersBtn) {
    elements.myOrdersBtn.addEventListener("click", handleShowOrderHistory);
  }

  if (elements.closeOrderModalBtn) {
    elements.closeOrderModalBtn.addEventListener(
      "click",
      handleCloseOrderModal
    );
  }

  if (elements.orderHistoryModal) {
    elements.orderHistoryModal.addEventListener("click", (e) => {
      if (e.target === elements.orderHistoryModal) {
        handleCloseOrderModal();
      }
    });
  }

  // 啟動應用程式
  init();
});
