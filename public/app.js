document.addEventListener("DOMContentLoaded", () => {
  const productListEl = document.getElementById("product-list");
  const emailEl = document.getElementById("email");
  const errorEl = document.getElementById("error-message");
  const loadingModal = document.getElementById("loading-modal");
  let csrfToken = "";

  // Helper functions for UI feedback
  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.add("show");
    hideLoading();
  };
  const clearError = () => errorEl.classList.remove("show");
  const showLoading = () => loadingModal.classList.add("show");
  const hideLoading = () => loadingModal.classList.remove("show");

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
        <img src="${product.image}" alt="${product.name}" class="product-image">
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
    document.querySelectorAll(".pay-button").forEach(button => {
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

    try {
      clearError();
      button.disabled = true;
      showLoading();

      const email = emailEl.value.trim();
      if (!email || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/g.test(email)) {
        showError("請在上方輸入有效的 Email");
        button.disabled = false;
        return;
      }

      const turnstileToken = turnstile.getResponse();
      if (!turnstileToken) {
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
        body: JSON.stringify({ email, productID, turnstileToken }),
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
      button.disabled = false;
    }
  };

  // Initialize the page
  const init = async () => {
    await fetchCsrfToken();
    await fetchProducts();
  };

  init();
});