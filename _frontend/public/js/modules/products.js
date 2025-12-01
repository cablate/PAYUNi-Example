/**
 * 商品管理模組
 * 處理商品列表載入、篩選和渲染
 */

export class ProductManager {
  constructor() {
    this.products = [];
    this.selectedProductId = null;
    this.currentTab = "subscription"; // 'subscription' | 'one_time'
  }

  /**
   * 獲取商品列表
   * @returns {Promise<Array>} 商品資料陣列
   */
  async fetchProducts() {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed");
      this.products = await res.json();
      return this.products;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * 設定目前標籤
   * @param {string} tab - 標籤名稱
   */
  setTab(tab) {
    this.currentTab = tab;
  }

  /**
   * 取得篩選後的商品清單
   * @returns {Array} 篩選後的商品陣列
   */
  getFilteredProducts() {
    return this.products.filter((p) => {
      if (this.currentTab === "subscription") {
        return p.type === "subscription" || !p.type;
      }
      return p.type === "one_time";
    });
  }

  /**
   * 選擇商品
   * @param {string} id - 商品 ID
   * @returns {Object} 選中的商品物件
   */
  selectProduct(id) {
    this.selectedProductId = id;
    return this.products.find((p) => p.id === id);
  }

  /**
   * 取得選中的商品
   * @returns {Object|null} 選中的商品物件或 null
   */
  getSelectedProduct() {
    return this.products.find((p) => p.id === this.selectedProductId);
  }

  /**
   * 渲染商品列表
   * @param {Element} container - 容器元素
   * @param {Object} currentUser - 目前使用者
   */
  renderProducts(container, currentUser) {
    container.innerHTML = "";

    const filtered = this.getFilteredProducts();

    if (filtered.length === 0) {
      container.innerHTML = `<div class="error show">沒有找到商品</div>`;
      return;
    }

    filtered.forEach((product) => {
      if (this.currentTab === "subscription") {
        this._renderSubscriptionCard(product, container, currentUser);
      } else {
        this._renderOneTimeCard(product, container, currentUser);
      }
    });
  }

  /**
   * 渲染訂閱卡片
   * @private
   * @param {Object} product - 商品物件
   * @param {Element} container - 容器元素
   * @param {Object} currentUser - 目前使用者
   */
  _renderSubscriptionCard(product, container, currentUser) {
    const option = document.createElement("div");
    option.className = `plan-option fade-in`;
    option.dataset.id = product.id;

    // 檢查權益
    const entitlement = currentUser?.entitlements?.find(
      (e) => e.productId === product.id && e.status === "active"
    );
    const isSubscribed = !!entitlement;

    let statusHtml = "";
    if (isSubscribed) {
      const expiryDate = new Date(entitlement.expiryDate).toLocaleDateString();
      statusHtml = `<div class="plan-status">訂閱中 (到期: ${expiryDate})</div>`;
      option.classList.add("owned");
    }

    option.innerHTML = `
      <input type="radio" name="plan" class="plan-radio" value="${product.id}" ${
      isSubscribed ? "disabled" : ""
    }>
      <div class="plan-details">
        <span class="plan-name">${product.name} ${statusHtml}</span>
        <span class="plan-desc">${product.description}</span>
      </div>
      <span class="plan-price">$${product.price} <span style="font-size:12px;font-weight:400;color:#64748B">${
      product.period || ""
    }</span></span>
    `;

    if (!isSubscribed) {
      option.addEventListener("click", () => {
        this.selectProduct(product.id);
        this._updateSelectedUI(product.id, container);
      });
    } else {
      option.style.cursor = "default";
      option.style.opacity = "0.8";
      option.style.borderColor = "#10B981";
    }
    container.appendChild(option);
  }

  /**
   * 渲染一次性購買卡片
   * @private
   * @param {Object} product - 商品物件
   * @param {Element} container - 容器元素
   * @param {Object} currentUser - 目前使用者
   */
  _renderOneTimeCard(product, container, currentUser) {
    const card = document.createElement("div");
    card.className = `product-card-horizontal fade-in`;
    card.dataset.id = product.id;

    // 檢查是否已擁有
    const isOwned = currentUser?.entitlements?.some(
      (e) => e.productId === product.id && e.status === "active"
    );

    // 使用圖示（emoji）或圖片
    let thumbHTML = "";
    if (product.icon) {
      const bgColor = product.iconColor || "#E2E8F0";
      thumbHTML = `<div class="product-thumb product-icon" style="background: ${bgColor}">${product.icon}</div>`;
    } else {
      const imageSrc =
        product.image ||
        "https://placehold.co/64x64/E2E8F0/64748B?text=IMG";
      thumbHTML = `<img src="${imageSrc}" alt="${product.name}" class="product-thumb">`;
    }

    let actionBtn = `<span class="product-price-tag">$${product.price}</span>`;
    if (isOwned) {
      actionBtn = `<span class="product-price-tag" style="background:#10B981;color:white">已購買</span>`;
      card.classList.add("owned");
      card.style.cursor = "default";
    }

    card.innerHTML = `
      ${thumbHTML}
      <div class="product-info">
        <span class="product-title">${product.name}</span>
        <span class="product-meta">${
          product.features[0] || product.description
        }</span>
      </div>
      ${actionBtn}
    `;

    if (!isOwned) {
      card.addEventListener("click", () => {
        this.selectProduct(product.id);
        this._updateSelectedUI(product.id, container);
      });
    }
    container.appendChild(card);
  }

  /**
   * 更新選中的卡片 UI
   * @private
   * @param {string} productId - 商品 ID
   * @param {Element} container - 容器元素
   */
  _updateSelectedUI(productId, container) {
    const allCards = container.querySelectorAll(
      ".plan-option, .product-card-horizontal"
    );
    allCards.forEach((el) => {
      if (el.dataset.id === productId) {
        el.classList.add("selected");
        const radio = el.querySelector("input[type='radio']");
        if (radio) radio.checked = true;
      } else {
        el.classList.remove("selected");
        const radio = el.querySelector("input[type='radio']");
        if (radio) radio.checked = false;
      }
    });
  }
}
