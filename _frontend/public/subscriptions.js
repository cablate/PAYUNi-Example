/**
 * 訂閱管理頁面邏輯
 */

let currentUser = null;
let subscriptions = [];
let cancelTarget = null;

/**
 * 檢查登入狀態
 */
async function checkLoginStatus() {
  try {
    console.log("Checking login status...");
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
      console.error("Auth check failed with status:", response.status);
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

  const html = subscriptions.map((sub) => {
    const isActive = sub.status === "active" && !sub.cancelledAt;
    const statusBadgeClass = isActive ? "status-paid" : "status-failed";
    const statusText = isActive ? "Active" : "Cancelled";

    return `
      <div class="checkout-step subscription-card ${!isActive ? 'inactive' : ''}">
        <div class="step-header">
          <span class="step-number">${isActive ? '✓' : '✕'}</span>
          <div class="subscription-header-content">
            <h3>${getProductName(sub.productId)}</h3>
            <span class="status-badge ${statusBadgeClass}">${statusText}</span>
          </div>
        </div>
        
        <div class="payment-summary subscription-summary">
          <div class="row summary-row">
            <span>Start Date</span>
            <span>${formatDate(sub.startDate)}</span>
          </div>
          ${sub.expiryDate ? `
          <div class="row summary-row">
            <span>Expiry Date</span>
            <span>${formatDate(sub.expiryDate)}</span>
          </div>
          ` : ''}
          ${sub.nextBillingDate && isActive ? `
          <div class="row summary-row">
            <span>Next Billing</span>
            <span class="next-billing-date">${formatDate(sub.nextBillingDate)}</span>
          </div>
          ` : ''}
          ${sub.cancelledAt ? `
          <div class="row">
            <span>Cancelled</span>
            <span>${formatDate(sub.cancelledAt)}</span>
          </div>
          ` : ''}
        </div>
        
        ${sub.cancelledAt ? `
          <p class="step-desc cancellation-notice">
            ℹ️ Subscription cancelled. Benefits remain active until ${formatDate(sub.expiryDate)}
          </p>
        ` : ''}
        
        ${isActive && sub.periodTradeNo ? `
          <button 
            class="pay-button-large btn-cancel-subscription" 
            data-period-trade-no="${sub.periodTradeNo}"
            data-product-name="${getProductName(sub.productId)}"
            data-expiry-date="${sub.expiryDate}"
          >
            Cancel Subscription
          </button>
        ` : ''}
      </div>
    `;
  }).join("");

  subscriptionsList.innerHTML = html;

  // 綁定取消按鈕
  document.querySelectorAll(".pay-button-large[data-period-trade-no]").forEach((btn) => {
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

  message.textContent = `Are you sure you want to cancel "${cancelTarget.productName}"? Your benefits will remain active until ${formatDate(cancelTarget.expiryDate)}.`;

  modal.classList.remove("hidden");
}

/**
 * 執行取消
 */
async function confirmCancel() {
  if (!cancelTarget) return;

  const confirmBtn = document.getElementById("confirmCancelBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Cancelling...";

  try {
    const response = await fetch(
      `/api/subscriptions/${cancelTarget.periodTradeNo}/cancel`,
      {
        method: "POST",
      }
    );

    const data = await response.json();

    if (response.ok && data.success) {
      alert(`✅ Subscription cancelled successfully\n\nBenefits remain until: ${formatDate(cancelTarget.expiryDate)}`);
      closeModal();
      loadSubscriptions();
    } else {
      throw new Error(data.error || "Failed to cancel");
    }
  } catch (error) {
    console.error("取消失敗:", error);
    alert(`❌ Failed to cancel: ${error.message}`);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirm Cancel";
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
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * 取得商品名稱
 */
function getProductName(productId) {
  const productNames = {
    plan_basic: "Basic Plan",
    plan_premium: "Premium Plan",
    plan_enterprise: "Enterprise Plan",
    product_onetime: "Lifetime Plan",
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
