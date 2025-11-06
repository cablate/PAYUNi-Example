// Payment Form Event Handler
document.addEventListener("DOMContentLoaded", async () => {
  const payButton = document.getElementById("pay-button");
  const errorEl = document.getElementById("error-message");
  const loadingModal = document.getElementById("loading-modal");

  // 從 API 端點取得 CSRF token
  let csrfToken = "";
  try {
    const csrfRes = await fetch("/csrf-token");
    const csrfData = await csrfRes.json();
    csrfToken = csrfData.csrfToken;
  } catch (error) {
    console.error("Failed to fetch CSRF token:", error);
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.add("show");
    payButton.disabled = false;
    loadingModal.classList.remove("show");
  }

  function clearError() {
    errorEl.classList.remove("show");
  }

  function showLoading() {
    loadingModal.classList.add("show");
  }

  function hideLoading() {
    loadingModal.classList.remove("show");
  }

  payButton.addEventListener("click", async () => {
    try {
      clearError();
      payButton.disabled = true;
      showLoading();

      const email = document.getElementById("email").value.trim();
      if (!email) {
        showError("請輸入 Email");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showError("Email 格式不正確");
        return;
      }

      const token = await turnstile.getResponse();
      if (!token) {
        showError("請完成驗證");
        payButton.disabled = false;
        hideLoading();
        return;
      }

      // 使用動態取得的 CSRF token
      if (!csrfToken) {
        showError("安全驗證失敗，請重新整理頁面");
        payButton.disabled = false;
        hideLoading();
        return;
      }

      const res = await fetch("http://localhost/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken, // 在 header 中提交 CSRF token
        },
        body: JSON.stringify({
          turnstileToken: token,
          email: email,
        }),
      });

      if (!res.ok) {
        throw new Error("Payment creation failed");
      }

      const { payUrl, data } = await res.json();

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
      console.error("Error:", error);
      showError("支付建立失敗，請重試");
    }
  });
});
