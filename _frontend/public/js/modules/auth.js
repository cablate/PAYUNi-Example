/**
 * 認證管理模組
 * 處理使用者登入狀態檢查與 UI 更新
 */

export class AuthManager {
  constructor() {
    this.currentUser = null;
  }

  /**
   * 檢查使用者登入狀態
   * @returns {Promise<Object|null>} 使用者物件或 null
   */
  async checkLoginStatus() {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) return null;
      const data = await res.json();
      return data.loggedIn ? data.user : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 更新使用者 UI 狀態
   * @param {Object} user - 使用者物件
   * @param {Object} elements - DOM 元素集合
   * @param {Function} onUserUpdated - 使用者狀態更新回調
   */
  updateUI(user, elements, onUserUpdated = null) {
    this.currentUser = user;

    if (user) {
      // 顯示已登入檢視
      elements.guestView.classList.add("hidden");
      elements.userView.classList.remove("hidden");

      // 填入使用者資料
      elements.userAvatar.src = user.picture || "";
      elements.userName.textContent = user.name;

      // 檢查是否有有效的訂閱
      const hasActiveSubscription = user.entitlements?.some(
        (e) => e.type === "subscription" && e.status === "active"
      );
      if (hasActiveSubscription) {
        this._addPremiumBadge(elements.userName);
      }

      // 啟用步驟 2（方案選擇）
      if (elements.planSection) {
        elements.planSection.classList.remove("disabled");
      }
    } else {
      // 顯示訪客檢視
      elements.userView.classList.add("hidden");
      elements.guestView.classList.remove("hidden");

      // 禁用步驟 2 & 3
      if (elements.planSection) {
        elements.planSection.classList.add("disabled");
      }
      if (elements.paymentSection) {
        elements.paymentSection.classList.add("disabled");
      }
      if (elements.payBtn) {
        elements.payBtn.disabled = true;
      }
    }

    // 觸發回調
    if (onUserUpdated) {
      onUserUpdated(user);
    }
  }

  /**
   * 新增 Premium 徽章
   * @private
   * @param {Element} element - 目標元素
   */
  _addPremiumBadge(element) {
    const badge = document.createElement("span");
    badge.className = "status-badge status-active";
    badge.style.marginLeft = "8px";
    badge.style.fontSize = "12px";
    badge.textContent = "Premium";
    element.appendChild(badge);
  }

  /**
   * 取得目前使用者
   * @returns {Object|null} 使用者物件或 null
   */
  getCurrentUser() {
    return this.currentUser;
  }
}
