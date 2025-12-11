/**
 * 訂閱管理頁面邏輯
 */

let currentUser = null;
let subscriptions = [];
let cancelTarget = null;
let csrfToken = "";

/**
 * 檢查登入狀態
 */
async function checkLoginStatus() {
  try {
    console.log("檢查登入狀態...");
    const response = await fetch("/api/me");
    console.log("Response status:", response.status);

    if (response.ok) {
      const data = await response.json();
      console.log("Auth data:", data);

      if (data.loggedIn) {
        currentUser = data.user;
        return true;
      }
    } else {
      console.error("登入檢查失敗，狀態碼:", response.status);
    }
    return false;
  } catch (error) {
    console.error("檢查登入狀態失敗:", error);
    return false;
  }
}

/**
 * 載入訂閱列表
 */
async function loadSubscriptions() {
  const loadingState = document.getElementById("loadingState");
  const subscriptionsList = document.getElementById("subscriptionsList");
  const emptyState = document.getElementById("emptyState");

  loadingState.style.display = "block";
  subscriptionsList.innerHTML = "";
  emptyState.style.display = "none";

  try {
    const response = await fetch("/api/subscriptions");

    if (!response.ok) {
      throw new Error("載入訂閱失敗");
    }

    const data = await response.json();
    subscriptions = data.subscriptions || [];

    loadingState.style.display = "none";

    if (subscriptions.length === 0) {
      emptyState.style.display = "block";
      return;
    }

    renderSubscriptions();
  } catch (error) {
    console.error("載入訂閱失敗:", error);
    loadingState.style.display = "none";
    subscriptionsList.innerHTML = `
      <div class="checkout-step">
        <p class="error">載入訂閱失敗，請稍後再試</p>
      </div>
    `;
  }
}

/**
 * 渲染訂閱列表
 */
function renderSubscriptions() {
  const subscriptionsList = document.getElementById("subscriptionsList");

  // 分離有效和無效訂閱
  const activeSubs = subscriptions.filter(sub => sub.status === "active" && !sub.cancelledAt);
  const inactiveSubs = subscriptions.filter(sub => sub.status !== "active" || sub.cancelledAt);

  let html = `<div class="dashboard-grid">`;

  // 渲染有效訂閱 (Hero Cards)
  if (activeSubs.length > 0) {
    html += activeSubs.map(sub => {
      // 計算進度
      const start = new Date(sub.startDate).getTime();
      const next = new Date(sub.nextBillingDate).getTime();
      const now = Date.now();
      const totalDuration = next - start;
      const elapsed = now - start;
      // 簡單進度計算 (以週期計)
      const progressPercent = Math.min(100, Math.max(0, (elapsed % (30 * 24 * 60 * 60 * 1000)) / (30 * 24 * 60 * 60 * 1000) * 100));

      return `
        <div class="rich-card">
          <div class="card-header">
            <div class="card-title-group">
              <h3>${getProductName(sub.productId)}</h3>
              <span class="card-subtitle">有效方案</span>
            </div>
            <span class="status-badge-glow status-active">有效</span>
          </div>

          <div class="progress-container">
            <div class="progress-label">
              <span>計費週期</span>
              <span>${Math.round(progressPercent)}%</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
          </div>

          <div class="card-body-grid">
            <div class="info-group">
              <span class="info-label">下次扣款日</span>
              <span class="info-value highlight">${formatDate(sub.nextBillingDate)}</span>
            </div>
            <div class="info-group">
              <span class="info-label">開始日期</span>
              <span class="info-value">${formatDate(sub.startDate)}</span>
            </div>
          </div>

          <div class="card-actions">
            <button class="btn-outline">管理方案</button>
            ${sub.periodTradeNo ? `
            <button
              class="btn-danger-text btn-cancel-subscription"
              data-period-trade-no="${sub.periodTradeNo}"
              data-product-name="${getProductName(sub.productId)}"
              data-expiry-date="${sub.expiryDate}"
            >
              取消訂閱
            </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join("");
  }

  // 渲染已取消/過期的訂閱 (緊湊版)
  if (inactiveSubs.length > 0) {
    html += `
      <h3 style="margin: 24px 0 16px; color: var(--text-secondary); font-size: 14px; letter-spacing: 0.05em;">過去的訂閱</h3>
    `;
    html += inactiveSubs.map(sub => {
      return `
        <div class="rich-card" style="opacity: 0.7;">
          <div class="card-header" style="margin-bottom: 0; padding-bottom: 0; border: none;">
            <div class="card-title-group">
              <h3 style="font-size: 16px;">${getProductName(sub.productId)}</h3>
              <span class="card-subtitle">結束於: ${formatDate(sub.expiryDate || sub.cancelledAt)}</span>
            </div>
            <span class="status-badge-glow status-cancelled">已取消</span>
          </div>
        </div>
      `;
    }).join("");
  }

  html += `</div>`; // Close grid
  subscriptionsList.innerHTML = html;

  // 綁定取消按鈕
  document.querySelectorAll(".btn-cancel-subscription").forEach((btn) => {
    btn.addEventListener("click", handleCancelClick);
  });
}

/**
 * 處理取消點擊
 */
function handleCancelClick(e) {
  const btn = e.target;
  cancelTarget = {
    periodTradeNo: btn.dataset.periodTradeNo,
    productName: btn.dataset.productName,
    expiryDate: btn.dataset.expiryDate,
  };

  const modal = document.getElementById("cancelModal");
  const message = document.getElementById("cancelMessage");

  message.textContent = `確定要取消「${cancelTarget.productName}」嗎？您的權益將維持到 ${formatDate(cancelTarget.expiryDate)} 為止。`;

  modal.classList.remove("hidden");
}

/**
 * 執行取消
 */
async function confirmCancel() {
  if (!cancelTarget) return;

  const confirmBtn = document.getElementById("confirmCancelBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "取消中...";

  try {
    const response = await fetch(
      `/api/subscriptions/${cancelTarget.periodTradeNo}/cancel`,
      {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      }
    );

    const data = await response.json();

    if (response.ok && data.success) {
      alert(`✅ 訂閱已成功取消\n\n您的權益將維持到：${formatDate(cancelTarget.expiryDate)}`);
      closeModal();
      loadSubscriptions();
    } else {
      throw new Error(data.error || "取消失敗");
    }
  } catch (error) {
    console.error("取消失敗:", error);
    alert(`❌ 取消失敗：${error.message}`);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "確認取消";
  }
}

/**
 * 關閉對話框
 */
function closeModal() {
  document.getElementById("cancelModal").classList.add("hidden");
  cancelTarget = null;
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * 取得商品名稱
 */
function getProductName(productId) {
  const productNames = {
    plan_basic: "基礎方案",
    plan_premium: "進階方案",
    plan_enterprise: "企業方案",
    product_onetime: "終身方案",
  };
  return productNames[productId] || productId;
}

/**
 * 初始化
 */
async function init() {
  const loadingModal = document.getElementById("loading-modal");
  loadingModal.classList.add("show");

  try {
    const tokenRes = await fetch("/csrf-token");
    if (tokenRes.ok) {
      const data = await tokenRes.json();
      csrfToken = data.csrfToken;
    }
    const isLoggedIn = await checkLoginStatus();

    if (!isLoggedIn) {
      document.getElementById("loginPrompt").style.display = "block";
      document.getElementById("loginBtn").addEventListener("click", () => {
        window.location.href = "/auth/google";
      });
      return;
    }

    document.getElementById("loginPrompt").style.display = "none";
    document.getElementById("subscriptionsContainer").style.display = "block";

    // 綁定對話框按鈕
    document.getElementById("confirmCancelBtn").addEventListener("click", confirmCancel);
    document.getElementById("cancelCancelBtn").addEventListener("click", closeModal);
    document.getElementById("closeCancelModal").addEventListener("click", closeModal);

    // 載入訂閱
    await loadSubscriptions();
  } finally {
    loadingModal.classList.remove("show");
  }
}

init();
