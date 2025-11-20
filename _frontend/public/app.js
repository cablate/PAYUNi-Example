// Turnstile Callback
window.onTurnstileSuccess = function(token) {
  // Optional: You could auto-enable something here if needed
  // For now, we just wait for the Pay button click which checks turnstile.getResponse()
};

document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const productOptionsEl = document.getElementById("product-options");
  const payBtn = document.getElementById("pay-btn");
  const totalAmountEl = document.getElementById("total-amount");
  const errorEl = document.getElementById("error-message");
  const loadingModal = document.getElementById("loading-modal");
  
  // Sections
  const authSection = document.getElementById("auth-section");
  const planSection = document.getElementById("plan-section");
  const paymentSection = document.getElementById("payment-section");

  // Auth Views
  const guestView = document.getElementById("guest-view");
  const userView = document.getElementById("user-view");
  const loginBtn = document.getElementById("login-btn");
  
  // User Meta
  const userAvatarEl = document.getElementById("user-avatar");
  const userNameEl = document.getElementById("user-name");
  const logoutBtn = document.getElementById("logout-btn");

  // Order History
  const myOrdersBtn = document.getElementById("my-orders-btn");
  const orderHistoryModal = document.getElementById("order-history-modal");
  const closeOrderModalBtn = document.getElementById("close-order-modal-btn");
  const orderHistoryBody = document.getElementById("order-history-body");
  const noOrdersMessage = document.getElementById("no-orders-message");

  // State
  let csrfToken = "";
  let currentUser = null;
  let clientConfig = {};
  let selectedProductId = null;
  let productsData = [];

  // --- Helpers ---
  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.add("show");
    hideLoading();
  };
  const clearError = () => errorEl.classList.remove("show");
  const showLoading = () => loadingModal.classList.add("show");
  const hideLoading = () => loadingModal.classList.remove("show");

  // --- Auth Logic ---
  const updateUserUI = (user) => {
    currentUser = user;
    
    if (user) {
      // Show User View
      guestView.classList.add("hidden");
      userView.classList.remove("hidden");
      
      // Fill Data
      userAvatarEl.src = user.picture || "";
      userNameEl.textContent = user.name;
      
      // Enable Step 2 (Plan Selection)
      planSection.classList.remove("disabled");
      
      // If a plan is already selected, enable Step 3
      if (selectedProductId) {
        paymentSection.classList.remove("disabled");
        payBtn.disabled = false;
      }
    } else {
      // Show Guest View
      userView.classList.add("hidden");
      guestView.classList.remove("hidden");
      
      // Disable Steps 2 & 3
      planSection.classList.add("disabled");
      paymentSection.classList.add("disabled");
      payBtn.disabled = true;
    }
  };

  const checkLoginStatus = async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      return data.loggedIn ? data.user : null;
    } catch (e) {
      return null;
    }
  };

  // --- Product Logic ---
  // --- Product Logic ---
  let currentTab = 'subscription'; // 'subscription' | 'one_time'

  const renderProducts = () => {
    productOptionsEl.innerHTML = "";
    
    // Filter products based on tab
    const filteredProducts = productsData.filter(p => {
      if (currentTab === 'subscription') return p.type === 'subscription' || !p.type;
      return p.type === 'one_time';
    });

    if (filteredProducts.length === 0) {
      productOptionsEl.innerHTML = `<div class="error show">No products found for this category.</div>`;
      return;
    }

    filteredProducts.forEach(product => {
      if (currentTab === 'subscription') {
        renderSubscriptionCard(product);
      } else {
        renderOneTimeCard(product);
      }
    });
  };

  const renderSubscriptionCard = (product) => {
    const option = document.createElement("div");
    option.className = `plan-option fade-in`;
    option.dataset.id = product.id;
    
    option.innerHTML = `
      <input type="radio" name="plan" class="plan-radio" value="${product.id}">
      <div class="plan-details">
        <span class="plan-name">${product.name}</span>
        <span class="plan-desc">${product.description}</span>
      </div>
      <span class="plan-price">$${product.price} <span style="font-size:12px;font-weight:400;color:#64748B">${product.period || ''}</span></span>
    `;
    
    option.addEventListener("click", () => selectProduct(product.id));
    productOptionsEl.appendChild(option);
  };

  const renderOneTimeCard = (product) => {
    const card = document.createElement("div");
    card.className = `product-card-horizontal fade-in`;
    card.dataset.id = product.id;

    // Use icon (emoji) if available, otherwise fallback to image
    let thumbHTML = '';
    if (product.icon) {
      const bgColor = product.iconColor || '#E2E8F0';
      thumbHTML = `<div class="product-thumb product-icon" style="background: ${bgColor}">${product.icon}</div>`;
    } else {
      const imageSrc = product.image || "https://placehold.co/64x64/E2E8F0/64748B?text=IMG";
      thumbHTML = `<img src="${imageSrc}" alt="${product.name}" class="product-thumb">`;
    }

    card.innerHTML = `
      ${thumbHTML}
      <div class="product-info">
        <span class="product-title">${product.name}</span>
        <span class="product-meta">${product.features[0] || product.description}</span>
      </div>
      <span class="product-price-tag">$${product.price}</span>
    `;

    card.addEventListener("click", () => selectProduct(product.id));
    productOptionsEl.appendChild(card);
  };

  const selectProduct = (id) => {
    if (!currentUser) return;
    
    selectedProductId = id;
    const product = productsData.find(p => p.id === id);
    
    // Update UI based on card type
    const allCards = document.querySelectorAll(".plan-option, .product-card-horizontal");
    allCards.forEach(el => {
      if (el.dataset.id === id) {
        el.classList.add("selected");
        const radio = el.querySelector("input[type='radio']");
        if (radio) radio.checked = true;
      } else {
        el.classList.remove("selected");
        const radio = el.querySelector("input[type='radio']");
        if (radio) radio.checked = false;
      }
    });
    
    // Update Total
    totalAmountEl.textContent = `$${product.price}`;
    
    // Enable Step 3
    paymentSection.classList.remove("disabled");
    payBtn.disabled = false;
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed");
      productsData = await res.json(); // Store globally
      renderProducts(); // Render with current state
    } catch (error) {
      console.error(error);
      productOptionsEl.innerHTML = `<div class="error show">Failed to load plans.</div>`;
    }
  };

  // --- Tab Logic ---
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      // Update Tab UI
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      
      // Update State & Render
      currentTab = e.target.dataset.tab;
      renderProducts();
    });
  });

  // --- Payment Logic ---
  const handlePayment = async () => {
    if (!currentUser || !selectedProductId) return;
    
    try {
      clearError();
      payBtn.disabled = true;
      showLoading();
      
      const turnstileToken = turnstile.getResponse();
      
      if (clientConfig.turnstileEnable && !turnstileToken) {
        showError("Please complete the security check.");
        payBtn.disabled = false;
        return;
      }

      // 根據商品類型選擇 API endpoint
      const product = productsData.find(p => p.id === selectedProductId);
      const endpoint = product.type === 'subscription' 
        ? '/create-subscription' 
        : '/create-payment';

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          productID: selectedProductId,
          turnstileToken: turnstileToken
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Payment failed");

      // Redirect logic
      const { payUrl, data } = resData;
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
      console.error(error);
      showError(error.message || "Payment creation failed");
      payBtn.disabled = false;
    }
  };

  // --- Initialization ---
  const init = async () => {
    showLoading();
    
    // Parallel fetch
    const [csrfRes, configRes] = await Promise.all([
      fetch("/csrf-token"),
      fetch("/api/client-config")
    ]);
    
    if (csrfRes.ok) {
      const data = await csrfRes.json();
      csrfToken = data.csrfToken;
    }
    
    if (configRes.ok) {
      clientConfig = await configRes.json();
    }
    
    // Load User & Products
    const user = await checkLoginStatus();
    await fetchProducts();
    
    updateUserUI(user);
    hideLoading();
  };

  // --- Event Listeners ---
  payBtn.addEventListener("click", handlePayment);
  
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      loginBtn.classList.add("loading"); // Optional visual feedback
      window.location.href = "/auth/google";
    });
  }

  // Order History Logic (Preserved)
  if (myOrdersBtn) {
    myOrdersBtn.addEventListener("click", async () => {
      showLoading();
      try {
        const res = await fetch("/api/my-orders");
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error);
        
        // Render Table
        orderHistoryBody.innerHTML = "";
        if (data.orders && data.orders.length > 0) {
          noOrdersMessage.classList.add("hidden");
          data.orders.forEach(order => {
            const row = document.createElement("tr");
            row.innerHTML = `
              <td>${new Date(order.createdAt).toLocaleDateString()}</td>
              <td>${order.productName || "License"}</td>
              <td>$${order.tradeAmt}</td>
              <td><span class="status-badge status-${order.status.toLowerCase()}">${order.status}</span></td>
            `;
            orderHistoryBody.appendChild(row);
          });
        } else {
          noOrdersMessage.classList.remove("hidden");
        }
        orderHistoryModal.classList.remove("hidden");
      } catch (e) {
        showError(e.message);
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
  
  if (orderHistoryModal) {
    orderHistoryModal.addEventListener("click", (e) => {
      if (e.target === orderHistoryModal) orderHistoryModal.classList.add("hidden");
    });
  }

  // Run
  init();
});