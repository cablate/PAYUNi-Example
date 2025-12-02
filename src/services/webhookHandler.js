/**
 * Webhook 處理服務
 * 處理 Payuni webhook 通知，驗證、更新訂單和授予權益
 */

import logger from "../utils/logger.js";

export class WebhookHandler {
  constructor(payuniSDK, database, products) {
    this.sdk = payuniSDK;
    this.db = database;
    this.products = products;
  }

  /**
   * 處理 Payuni webhook 通知
   * @param {Object} webhookData - Webhook 請求主體
   * @returns {Promise<Object>} { success: boolean, message: string, data?: any }
   */
  async processWebhook(webhookData) {
    try {
      // Step 1: 驗證 webhook 資料
      const validationResult = await this._validateWebhookData(webhookData);
      if (!validationResult.success) {
        return validationResult;
      }

      const {
        parsedData,
        tradeNo,
        tradeSeq,
        payStatus,
        isPeriod,
      } = validationResult.data;

      // Step 2: 查詢訂單狀態
      const queryResult = await this._queryOrderStatus(tradeNo);
      if (!queryResult.success) {
        return queryResult;
      }

      const queryData = queryResult.data;

      // Step 3: 驗證金額一致性
      const amountValidation = await this._validateAmount(
        parsedData,
        queryData,
        tradeNo
      );
      if (!amountValidation.success) {
        return amountValidation;
      }

      // Step 4: 更新訂單
      const updateData = this._buildUpdateData(
        tradeNo,
        isPeriod,
        parsedData,
        queryData
      );

      const updateSuccess = await this.db.updateOrder(updateData);
      if (!updateSuccess) {
        logger.error("❌ 更新訂單失敗", { tradeNo });
        return { success: false, message: "更新訂單失敗" };
      }

      logger.info("✓ Webhook 處理成功（以 API 查詢資料為準）", {
        tradeNo,
        status: queryData.tradeStatusText,
        amount: queryData.amount,
        isPaid: queryData.isPaid,
        verified: true,
      });

      // Step 5: 授予權益（非關鍵，失敗不阻擋 webhook 回應）
      try {
        await this._grantEntitlements(
          tradeNo,
          isPeriod,
          parsedData,
          queryData
        );
      } catch (entitlementError) {
        logger.error("授予權益時發生錯誤", {
          tradeNo,
          errorMessage: entitlementError.message,
        });
        // 不阻擋 webhook 回應，因為訂單已更新成功
      }

      return {
        success: true,
        message: "Webhook 處理成功",
        data: {
          tradeNo,
          status: queryData.tradeStatusText,
          amount: queryData.amount,
        },
      };
    } catch (error) {
      logger.error("Webhook 處理異常", { errorMessage: error.message });
      return {
        success: false,
        message: "Webhook 處理失敗",
      };
    }
  }

  /**
   * 驗證 webhook 資料
   * @private
   * @param {Object} webhookData - Webhook 資料
   * @returns {Promise<Object>} 驗證結果
   */
  async _validateWebhookData(webhookData) {
    const { EncryptInfo, HashInfo, Status } = webhookData;

    // 檢查支付狀態
    if (Status !== "SUCCESS") {
      logger.warn("支付狀態不是 SUCCESS", { status: Status });
    }

    // 驗證 Hash
    if (!this.sdk.verifyWebhookData(EncryptInfo, HashInfo)) {
      logger.warn("Webhook 雜湊驗證失敗");
      return {
        success: false,
        message: "Webhook 雜湊驗證失敗",
      };
    }

    // 解密資料
    const parsedData = this.sdk.parseWebhookData(EncryptInfo);
    const tradeNo = parsedData.MerTradeNo;
    const tradeSeq = parsedData.TradeNo;
    const payStatus = parsedData.Status || "已完成";
    const isPeriod = parsedData.PeriodAmt > 0 || parsedData.PeriodTradeNo;

    // 檢查訂單編號
    if (!tradeNo) {
      logger.warn("Webhook 資料缺少商戶訂單編號");
      return {
        success: false,
        message: "Webhook 資料缺少商戶訂單編號",
      };
    }

    logger.info("Webhook 驗證通過", {
      tradeNo,
      tradeSeq,
      payStatus,
    });

    return {
      success: true,
      data: {
        parsedData,
        tradeNo,
        tradeSeq,
        payStatus,
        isPeriod,
      },
    };
  }

  /**
   * 查詢訂單狀態
   * @private
   * @param {string} tradeNo - 商戶訂單編號
   * @returns {Promise<Object>} 查詢結果
   */
  async _queryOrderStatus(tradeNo) {
    try {
      const queryResult = await this.sdk.queryTradeStatus(tradeNo);

      if (!queryResult.success) {
        logger.error("❌ 查詢訂單失敗，放棄更新", {
          tradeNo,
          error: queryResult.error,
        });
        return {
          success: false,
          message: "查詢訂單失敗",
        };
      }

      logger.info("✓ API 查詢成功", {
        tradeNo,
        amount: queryResult.data.amount,
        status: queryResult.data.tradeStatusText,
        isPaid: queryResult.data.isPaid,
      });

      return {
        success: true,
        data: queryResult.data,
      };
    } catch (queryError) {
      logger.error("⚠️ 查詢訂單異常，放棄更新", {
        tradeNo,
        error: queryError.message,
      });
      return {
        success: false,
        message: "查詢訂單異常",
      };
    }
  }

  /**
   * 驗證金額一致性
   * @private
   * @param {Object} parsedData - 解析後的 webhook 資料
   * @param {Object} queryData - 查詢結果資料
   * @param {string} tradeNo - 商戶訂單編號
   * @returns {Promise<Object>} 驗證結果
   */
  async _validateAmount(parsedData, queryData, tradeNo) {
    const webhookAmount = parseInt(parsedData.TradeAmt || parsedData.PeriodAmt);
    const queryAmount = parseInt(queryData.amount);

    if (queryAmount !== webhookAmount) {
      logger.error("❌ webhook 回調金額不符，請注意", {
        tradeNo,
        webhookAmount,
        queryAmount,
      });
      return {
        success: false,
        message: "金額驗證失敗",
      };
    }

    return {
      success: true,
    };
  }

  /**
   * 建立訂單更新資料
   * @private
   * @param {string} tradeNo - 原始訂單編號
   * @param {boolean} isPeriod - 是否為訂閱制
   * @param {Object} parsedData - 解析後的 webhook 資料
   * @param {Object} queryData - 查詢結果資料
   * @returns {Object} 更新資料
   */
  _buildUpdateData(tradeNo, isPeriod, parsedData, queryData) {
    return {
      MerTradeNo: isPeriod ? `${tradeNo.split("_")[0]}_0` : tradeNo,
      TradeSeq: queryData.tradeNo,
      Status: queryData.tradeStatusText,
      PeriodTradeNo: parsedData.PeriodTradeNo || "",
      PaymentMethod:
        queryData.paymentMethod || queryData.cardBankName || "信用卡",
      rawData: {
        ...parsedData,
        ...queryData,
      },
    };
  }

  /**
   * 授予使用者權益
   * @private
   * @param {string} tradeNo - 原始訂單編號
   * @param {boolean} isPeriod - 是否為訂閱制
   * @param {Object} parsedData - 解析後的 webhook 資料
   * @param {Object} queryData - 查詢結果資料
   */
  async _grantEntitlements(tradeNo, isPeriod, parsedData, queryData) {
    // 訂閱制需要轉換訂單號：_1、_2... -> _0 (原始訂單)
    const searchTradeNo = isPeriod
      ? `${tradeNo.split("_")[0]}_0`
      : tradeNo;

    const order = await this.db.getOrderByTradeNo(searchTradeNo);

    if (!order) {
      logger.warn("無法授予權益：找不到訂單", {
        originalTradeNo: tradeNo,
        searchTradeNo,
      });
      return;
    }

    const product = this.products.find((p) => p.id === order.productID);
    const user = await this.db.findUserByEmail(order.email);

    if (!product || !user) {
      logger.warn("無法授予權益：找不到商品或使用者", {
        productId: order.productID,
        email: order.email,
      });
      return;
    }

    // 授予權益
    await this.db.grantEntitlement(user.googleId, product, searchTradeNo);
    logger.info("✓ 權益已授予", {
      userId: user.googleId,
      productId: product.id,
    });

    // 記錄訂閱扣款（如果是訂閱制）
    if (isPeriod) {
      await this._recordPeriodPayment(
        tradeNo,
        searchTradeNo,
        parsedData,
        queryData
      );
    }
  }

  /**
   * 記錄訂閱扣款
   * @private
   * @param {string} tradeNo - 原始訂單編號
   * @param {string} searchTradeNo - 搜尋訂單編號
   * @param {Object} parsedData - 解析後的 webhook 資料
   * @param {Object} queryData - 查詢結果資料
   */
  async _recordPeriodPayment(tradeNo, searchTradeNo, parsedData, queryData) {
    const periodTradeNo = parsedData.PeriodTradeNo || "";
    const sequenceMatch = tradeNo.match(/_(\d+)$/);
    const sequenceNo = sequenceMatch ? parseInt(sequenceMatch[1]) : 0;

    await this.db.recordPeriodPayment({
      periodTradeNo: periodTradeNo,
      baseOrderNo: searchTradeNo,
      sequenceNo: sequenceNo,
      tradeSeq: queryData.tradeNo,
      amount: queryData.amount,
      status: queryData.tradeStatusText,
      paymentTime: queryData.paymentDay || new Date().toISOString(),
      remark: JSON.stringify({
        isPaid: queryData.isPaid,
        message: queryData.message,
      }),
    });

    logger.info("✓ 訂閱扣款已記錄", {
      periodTradeNo,
      sequenceNo,
    });
  }
}
