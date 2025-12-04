/**
 * UI 工具函數模組
 * 提供統一的使用者介面操作方法
 */

/**
 * 顯示錯誤訊息
 * @param {string} message - 錯誤訊息文字
 */
export function showError(message) {
  const errorEl = document.getElementById("error-message");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add("show");
  }
  hideLoading();
}

/**
 * 清除錯誤訊息
 */
export function clearError() {
  const errorEl = document.getElementById("error-message");
  if (errorEl) {
    errorEl.classList.remove("show");
  }
}

/**
 * 顯示載入中模態
 */
export function showLoading() {
  const loadingModal = document.getElementById("loading-modal");
  if (loadingModal) {
    loadingModal.classList.add("show");
  }
}

/**
 * 隱藏載入中模態
 */
export function hideLoading() {
  const loadingModal = document.getElementById("loading-modal");
  if (loadingModal) {
    loadingModal.classList.remove("show");
  }
}
