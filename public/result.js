document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    const iconContainer = document.getElementById("icon-container");
    const titleEl = document.getElementById("status-title");
    const messageEl = document.getElementById("status-message");
    const detailsContainer = document.getElementById("details-container");

    const successIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg>`;
    const failIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>`;

    function displayError(title, message) {
        document.body.classList.add("fail");
        iconContainer.innerHTML = failIcon;
        titleEl.textContent = title;
        messageEl.textContent = message;
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

        if (data.status === "success") {
            document.body.classList.add("success");
            iconContainer.innerHTML = successIcon;
            titleEl.textContent = "支付成功";
            messageEl.textContent = "感謝您的付款，以下是您的訂單詳細資料。";
            
            document.getElementById("trade-no").textContent = data.tradeNo;
            document.getElementById("trade-seq").textContent = data.tradeSeq;
            document.getElementById("trade-amt").textContent = `${data.tradeAmt} TWD`;
            document.getElementById("pay-time").textContent = new Date(data.payTime).toLocaleString();

            detailsContainer.classList.remove("hidden");
        } else {
            displayError("支付失敗", data.message || "發生未知錯誤，請聯繫客服。");
        }

    } catch (error) {
        console.error("Fetch error:", error);
        displayError("存取錯誤", error.message);
    }
});