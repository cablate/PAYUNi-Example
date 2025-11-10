// Turnstile 驗證成功後的回呼函式
window.onTurnstileSuccess = function(token) {
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.classList.remove("loading"); // 移除載入狀態
    loginBtn.disabled = false; // 啟用 Google 登入按鈕
    loginBtn.title = ""; // 清除提示
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const productListEl = document.getElementById("product-list");
  const errorEl = document.getElementById("error-message");
  const loadingModal = document.getElementById("loading-modal");

  // Auth UI elements
  const loginBtn = document.getElementById("login-btn");
  const userInfoEl = document.getElementById("user-info");
  const userAvatarEl = document.getElementById("user-avatar");
  const userNameEl = document.getElementById("user-name");

  // Order History UI elements
  const myOrdersBtn = document.getElementById("my-orders-btn");
  const orderHistoryModal = document.getElementById("order-history-modal");
  const closeOrderModalBtn = document.getElementById("close-order-modal-btn");
  const orderHistoryBody = document.getElementById("order-history-body");
  const noOrdersMessage = document.getElementById("no-orders-message");

  let csrfToken = "";
  let currentUser = null;
  let clientConfig = {}; // 新增：儲存從後端獲取的配置

  // Helper functions for UI feedback
  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.add("show");
    hideLoading();
  };
  const clearError = () => errorEl.classList.remove("show");
  const showLoading = () => loadingModal.classList.add("show");
  const hideLoading = () => loadingModal.classList.remove("show");

  // Updates UI based on login status
  const updateUserUI = (user) => {
    currentUser = user;
    const payButtons = document.querySelectorAll(".pay-button");

    // 預設隱藏所有認證相關的元素
    loginBtn.classList.add("hidden");
    userInfoEl.classList.add("hidden");

    if (user) {
      // User is logged in
      userInfoEl.classList.remove("hidden");
      userAvatarEl.src = user.picture || "";
      userNameEl.textContent = user.name;
      // Enable all pay buttons
      payButtons.forEach(button => {
        button.disabled = false;
        button.title = "";
      });
    } else {
      // User is not logged in
      loginBtn.classList.remove("hidden"); // 顯示登入按鈕
      loginBtn.classList.add("loading"); // 預設為載入中
      loginBtn.disabled = true; // 預設為禁用
      loginBtn.title = "請先完成人機驗證"; // 提示訊息

      // Disable all pay buttons and add a tooltip
      payButtons.forEach(button => {
        button.disabled = true;
        button.title = "請先登入以進行購買";
      });
    }
  };

  // Checks login status with the backend
  const checkLoginStatus = async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed to check login status");
      const data = await res.json();
      // The UI update will be called after products are rendered
      return data.loggedIn ? data.user : null;
    } catch (error) {
      console.error("Error checking login status:", error);
      // Don't show error to user, just assume logged out
      return null;
    }
  };

  // 新增：從後端獲取客戶端配置
  const fetchClientConfig = async () => {
    try {
      const res = await fetch("/api/client-config");
      if (!res.ok) throw new Error("Failed to fetch client config");
      clientConfig = await res.json();
    } catch (error) {
      console.error("Error fetching client config:", error);
      showError("無法載入配置資訊，請稍後再試。");
    }
  };

  // Fetches CSRF token on page load
  const fetchCsrfToken = async () => {
    try {
      const res = await fetch("/csrf-token");
      if (!res.ok) throw new Error("CSRF token fetch failed");
      const data = await res.json();
      csrfToken = data.csrfToken;
    } catch (error) {
      console.error("Failed to fetch CSRF token:", error);
      showError("安全憑證載入失敗，請重新整理頁面。");
    }
  };

  // Renders product cards to the DOM
  const renderProducts = (products) => {
    productListEl.innerHTML = ""; // Clear existing products
    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <div class="product-info">
          <h3 class="product-name">${product.name}</h3>
          <p class="product-description">${product.description}</p>
          <div class="product-price">${product.price} TWD</div>
          <button class="pay-button" data-product-id="${product.id}">立即購買</button>
        </div>
      `;
      productListEl.appendChild(card);
    });

    // Add event listeners to all new buttons
    document.querySelectorAll(".pay-button").forEach((button) => {
      button.addEventListener("click", handlePayment);
    });
  };

  // Fetches products from the API and renders them
  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      const products = await res.json();
      renderProducts(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      showError("無法載入商品列表，請稍後再試。");
    }
  };

  // Handles the payment creation process
  const handlePayment = async (event) => {
    const button = event.currentTarget;
    const productID = button.dataset.productId;

    // Double check if user is logged in before proceeding
    if (!currentUser) {
      showError("請先登入後再進行購買。");
      return;
    }

    try {
      clearError();
      button.disabled = true;
      showLoading();

      const paymentPayload = {
        productID,
        turnstileToken: turnstile.getResponse(),
      };

      // 使用從後端獲取的配置
      if (clientConfig.turnstileEnable && !paymentPayload.turnstileToken) {
        showError("請完成人機驗證");
        button.disabled = false;
        return;
      }

      if (!csrfToken) {
        showError("安全驗證失敗，請重新整理頁面");
        button.disabled = false;
        return;
      }

      const res = await fetch("/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(paymentPayload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Payment creation failed");
      }

      const { payUrl, data } = resData;

      // Create and submit a form to redirect to the payment gateway
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
    } catch (error) {
      console.error("Payment Error:", error);
      showError(error.message || "支付建立失敗，請重試");
      // Re-enable the button if payment fails
      button.disabled = false;
    } finally {
      // Hide loading indicator regardless of outcome, as we are redirecting
      // hideLoading();
    }
  };

  // Renders the order history table
  const renderOrderHistory = (orders) => {
    orderHistoryBody.innerHTML = ""; // Clear previous results
    if (orders && orders.length > 0) {
      noOrdersMessage.classList.add("hidden");
      orders.forEach(order => {
        const row = document.createElement("tr");
        const formattedDate = new Date(order.createdAt).toLocaleString("zh-TW", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        row.innerHTML = `
          <td>${formattedDate}</td>
          <td>${order.productName || "N/A"}</td>
          <td>${order.tradeAmt}</td>
          <td>${order.status}</td>
        `;
        orderHistoryBody.appendChild(row);
      });
    } else {
      noOrdersMessage.classList.remove("hidden");
    }
  };

  // Initialize the page
  const init = async () => {
    showLoading();
    await fetchCsrfToken();
    await fetchClientConfig(); // 在這裡呼叫，確保配置已載入
    const user = await checkLoginStatus();
    await fetchProducts();
    updateUserUI(user); // Update UI after products and buttons are on the page
    hideLoading();
  };

  init();

  // Add event listener for the login button
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      // Show loading spinner and disable button before redirecting
      loginBtn.classList.add("loading");
      loginBtn.disabled = true;
      window.location.href = "/auth/google";
    });
  }

  // Add event listeners for order history modal
  if (myOrdersBtn) {
    myOrdersBtn.addEventListener("click", async () => {
      showLoading();
      try {
        const res = await fetch("/api/my-orders");
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "無法獲取訂單");
        }
        renderOrderHistory(data.orders);
        orderHistoryModal.classList.remove("hidden");
      } catch (error) {
        showError(error.message);
      } finally {
        hideLoading();
      }
    });
  }

  if (closeOrderModalBtn) {
    closeOrderModalBtn.addEventListener("click", () => {
      orderHistoryModal.classList.add("hidden");
    });
  }
  
  // Close modal if user clicks outside the content area
  if (orderHistoryModal) {
    orderHistoryModal.addEventListener("click", (event) => {
      if (event.target === orderHistoryModal) {
        orderHistoryModal.classList.add("hidden");
      }
    });
  }
});