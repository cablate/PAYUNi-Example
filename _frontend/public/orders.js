/**
 * 檢查登入狀態
 */
async function checkLoginStatus() {
  try {
    const response = await fetch("/api/me");
    if (response.ok) {
      const data = await response.json();
      return data.loggedIn;
    }
    return false;
  } catch (error) {
    console.error("檢查登入狀態失敗:", error);
    return false;
  }
}

/**
 * 載入訂單列表
 */
async function loadOrders() {
  const loadingState = document.getElementById("loadingState");
  const ordersList = document.getElementById("ordersList");
  const emptyState = document.getElementById("emptyState");

  loadingState.style.display = "block";
  ordersList.innerHTML = "";
  emptyState.style.display = "none";

  try {
    const response = await fetch("/api/my-orders");
    const data = await response.json();

    if (data.success && data.orders.length > 0) {
      renderOrders(data.orders);
    } else {
      emptyState.style.display = "block";
    }
  } catch (error) {
    console.error("載入訂單失敗:", error);
    emptyState.style.display = "block";
  } finally {
    loadingState.style.display = "none";
  }
}

function renderOrders(orders) {
  const container = document.getElementById("ordersList");
  
  const html = orders.map(order => {
    const isSuccess = order.status === "SUCCESS" || order.status === "已付款" || order.status === "已完成";
    const successClass = isSuccess ? 'success' : 'failed';
    
    const date = new Date(order.createdAt).toLocaleDateString("zh-TW", {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const time = new Date(order.createdAt).toLocaleTimeString("zh-TW", {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return `
      <div class="checkout-step order-card order-card-${successClass}">
        <div class="order-status-badge order-status-badge-${successClass}">
          ${isSuccess ? '✓ PAID' : '✗ FAILED'}
        </div>
        
        <div class="step-header order-header">
          <span class="step-number order-icon order-icon-${successClass}">
            ${isSuccess ? '✓' : '✗'}
          </span>
          <div class="order-product-info">
            <h3 class="order-product-name">${order.productName}</h3>
            <p class="order-product-id">Order #${order.tradeNo.substring(0, 16)}...</p>
          </div>
        </div>
        
        <div class="order-amount-box order-amount-box-${successClass}">
          <div class="order-amount-label">Transaction Amount</div>
          <div class="order-amount-value order-amount-${successClass}">$${order.tradeAmt}</div>
        </div>
        
        <div class="order-details-grid">
          <div class="order-detail-box">
            <div class="order-detail-label">Status</div>
            <div class="order-detail-value order-detail-value-${successClass}">${order.status}</div>
          </div>
          
          <div class="order-detail-box">
            <div class="order-detail-label">Payment Method</div>
            <div class="order-detail-value">${order.paymentMethod || 'Credit Card'}</div>
          </div>
        </div>
        
        <div class="payment-summary">
          <div class="row">
            <span class="label order-label-with-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              Transaction Time
            </span>
            <span class="value">${date} ${time}</span>
          </div>
          ${order.tradeSeq ? `
          <div class="row">
            <span class="label order-label-with-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Receipt No.
            </span>
            <span class="value order-receipt-value">${order.tradeSeq}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = html;
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
    document.getElementById("ordersContainer").style.display = "block";

    // 載入訂單
    await loadOrders();
  } finally {
    loadingModal.classList.remove("show");
  }
}

init();
