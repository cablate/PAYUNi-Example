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

  // Calculate Stats
  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum, order) => sum + parseInt(order.tradeAmt || 0), 0);

  // Render Dashboard Header
  let html = `
    <div class="dashboard-stats">
      <div class="stat-card">
        <span class="stat-label">訂單總數</span>
        <span class="stat-value">${totalOrders}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">消費總額</span>
        <span class="stat-value">NT$ ${totalSpent.toLocaleString()}</span>
      </div>
    </div>
    <div class="dashboard-grid">
  `;

  // Render Rich Cards
  html += orders.map(order => {
    const isSuccess = order.status === "SUCCESS" || order.status === "已付款" || order.status === "已完成";
    const statusClass = isSuccess ? 'status-paid' : 'status-cancelled';
    const statusText = isSuccess ? '已付款' : '失敗';

    const date = new Date(order.createdAt).toLocaleDateString("zh-TW", {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // 支付方式中文化
    const paymentMethodMap = {
      'Credit Card': '信用卡',
      '信用卡': '信用卡',
      'ATM': 'ATM 轉帳',
      'CVS': '超商代碼',
    };
    const paymentMethod = paymentMethodMap[order.paymentMethod] || order.paymentMethod || '信用卡';

    return `
      <div class="rich-card">
        <div class="card-header">
          <div class="card-title-group">
            <h3>${order.productName}</h3>
            <span class="card-subtitle">訂單編號: ${order.tradeNo}</span>
          </div>
          <span class="status-badge-glow ${statusClass}">${statusText}</span>
        </div>

        <div class="card-body-grid">
          <div class="info-group">
            <span class="info-label">金額</span>
            <span class="info-value highlight">NT$ ${order.tradeAmt}</span>
          </div>
          <div class="info-group">
            <span class="info-label">日期</span>
            <span class="info-value">${date}</span>
          </div>
          <div class="info-group">
            <span class="info-label">付款方式</span>
            <span class="info-value">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
              ${paymentMethod}
            </span>
          </div>
          ${order.tradeSeq ? `
          <div class="info-group">
            <span class="info-label">交易序號</span>
            <span class="info-value">${order.tradeSeq}</span>
          </div>
          ` : ''}
        </div>

        <div class="card-actions">
          <button class="btn-outline" onclick="alert('發票下載功能即將推出！')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            下載發票
          </button>
        </div>
      </div>
    `;
  }).join("");

  html += `</div>`; // Close grid

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
