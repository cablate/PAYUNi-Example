document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    const iconContainer = document.getElementById("result-icon-container");
    const titleEl = document.getElementById("status-title");
    const messageEl = document.getElementById("status-message");
    const detailsContainer = document.getElementById("details-container");
    const actionsContainer = document.getElementById("result-actions");
    const errorFallback = document.getElementById("error-fallback");
    const errorMessage = document.getElementById("error-message");

    const successIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`;
    const failIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`;

    function displayError(title, message) {
        document.body.classList.add("fail");
        iconContainer.innerHTML = failIcon;
        titleEl.textContent = title;
        messageEl.textContent = message;
        actionsContainer.classList.remove("hidden");
        errorFallback.classList.remove("hidden");
        errorMessage.textContent = message;
    }

    if (!token) {
        displayError("無效的存取", "此頁面無法直接存取，請透過正常的支付流程返回。");
        return;
    }

    try {
        const response = await fetch(`/api/order-result/${token}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const message = errorData?.error || "無法獲取訂單資訊，可能連結已失效或網路發生問題。";
            throw new Error(message);
        }

        const data = await response.json();
        console.log("Order result data:", data);

        if (data.status === "success") {
            document.body.classList.add("success");
            iconContainer.innerHTML = successIcon;
            titleEl.textContent = "支付成功";
            messageEl.textContent = "感謝您的付款！您的訂單已成功完成，以下是詳細資訊。";
            
            document.getElementById("trade-no").textContent = data.tradeNo || "-";
            document.getElementById("trade-seq").textContent = data.tradeSeq || data.TradeNo || "-";
            document.getElementById("trade-amt").textContent = data.tradeAmt ? `NT$ ${data.tradeAmt}` : "-";
            document.getElementById("pay-time").textContent = data.payTime ? new Date(data.payTime).toLocaleString('zh-TW') : new Date().toLocaleString('zh-TW');

            detailsContainer.classList.remove("hidden");
            actionsContainer.classList.remove("hidden");
            
            // Show success badge
            const successBadge = document.getElementById("success-badge");
            if (successBadge) {
                successBadge.classList.remove("hidden");
            }
        } else {
            displayError("支付失敗", data.message || "發生未知錯誤，請聯繫客服。");
        }

    } catch (error) {
        console.error("Fetch error:", error);
        displayError("存取錯誤", error.message);
    }
});