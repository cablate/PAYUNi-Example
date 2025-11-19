/**
 * PayUNi SDK 類
 * 封裝 PayUNi 支付相關的所有加密、解密、驗證和資料處理邏輯
 *
 * 使用範例：
 *   const sdk = new PayuniSDK(config);
 *   const paymentInfo = sdk.generatePaymentInfo(tradeNo, product, email, returnUrl);
 *   const isValid = sdk.verifyWebhookData(encryptInfo, hashInfo);
 *   const data = sdk.parseWebhookData(encryptInfo);
 *   const tradeInfo = await sdk.queryTradeStatus(merTradeNo);
 */

import axios from "axios";
import querystring from "querystring";
import { decrypt, encrypt, sha256 } from "../../utils/crypto.js";
import logger from "../../utils/logger.js";

export class PayuniSDK {
  /**
   * 初始化 SDK
   * @param {Object} config - 配置物件
   * @param {string} config.merchantId - 商家ID
   * @param {string} config.hashKey - Hash 密鑰
   * @param {string} config.hashIV - Hash IV
   * @param {string} config.apiUrl - PayUNi API URL
   * @param {string} config.notifyUrl - Webhook 通知 URL
   */
  constructor(config) {
    if (!config.merchantId || !config.hashKey || !config.hashIV || !config.apiUrl) {
      throw new Error("PayuniSDK 配置不完整：需要 merchantId, hashKey, hashIV, apiUrl");
    }

    this.merchantId = config.merchantId;
    this.hashKey = config.hashKey;
    this.hashIV = config.hashIV;
    this.apiUrl = config.apiUrl;
    this.notifyUrl = config.notifyUrl;

    logger.info("PayuniSDK 已初始化", {
      merchantId: this.merchantId,
      apiUrl: this.apiUrl,
    });
  }

  /**
   * 生成支付資訊（包含 EncryptInfo 和 HashInfo）
   * @param {string} tradeNo - 訂單編號
   * @param {Object} product - 商品資訊 { price, name }
   * @param {string} userEmail - 用戶 Email
   * @param {string} returnUrl - 返回 URL
   * @returns {Object} { payUrl, data: { MerID, Version, EncryptInfo, HashInfo } }
   */
  generatePaymentInfo(tradeNo, product, userEmail, returnUrl) {
    try {
      const timestamp = Math.round(new Date().getTime() / 1000);

      // 構建交易資料
      const tradeData = {
        MerID: this.merchantId,
        Version: "1.0",
        MerTradeNo: tradeNo,
        TradeAmt: product.price,
        ProdDesc: product.name,
        NotifyURL: this.notifyUrl,
        ReturnURL: returnUrl,
        PayType: "C",
        Timestamp: timestamp,
        UsrMail: userEmail,
        UsrMailFix: 1,
      };

      // 轉換為查詢字串
      const plaintext = querystring.stringify(tradeData);

      // 加密
      const encryptInfo = this._encrypt(plaintext);

      // 生成 Hash
      const hashInfo = this._hash(encryptInfo);

      logger.info("支付資訊已生成", {
        tradeNo,
        timestamp,
        merchantId: this.merchantId,
      });

      return {
        payUrl: `${this.apiUrl}/api/upp`,
        data: {
          MerID: this.merchantId,
          Version: "1.0",
          EncryptInfo: encryptInfo,
          HashInfo: hashInfo,
        },
      };
    } catch (error) {
      logger.error("生成支付資訊失敗", {
        tradeNo,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 生成續期收款支付資訊
   * @param {string} tradeNo - 訂單編號
   * @param {Object} product - 商品資訊 { price, name, periodConfig }
   * @param {string} userEmail - 用戶 Email
   * @param {string} returnUrl - 返回 URL
   * @returns {Object} { payUrl, data: { MerID, Version, EncryptInfo, HashInfo } }
   */
  generatePeriodPaymentInfo(tradeNo, product, userEmail, returnUrl) {
    try {
      const { periodConfig } = product;
      
      if (!periodConfig) {
        throw new Error("商品缺少 periodConfig 配置");
      }

      // 構建續期收款資料
      const periodData = {
        MerID: this.merchantId,
        MerTradeNo: tradeNo,
        PeriodAmt: product.price,
        ProdDesc: product.name,
        PayerEmail: userEmail,
        PayerFix: "3", // 固定 Email
        PeriodType: periodConfig.periodType,
        PeriodDate: periodConfig.periodDate,
        PeriodTimes: periodConfig.periodTimes,
        FType: periodConfig.fType || "build",
        NotifyURL: this.notifyUrl,
        ReturnURL: returnUrl,
      };

      // 若有設定首期金額，加入參數
      if (periodConfig.fAmt) {
        periodData.FAmt = periodConfig.fAmt;
      }

      // 轉換為查詢字串
      const plaintext = querystring.stringify(periodData);

      //加密
      const encryptInfo = this._encrypt(plaintext);

      // 生成 Hash
      const hashInfo = this._hash(encryptInfo);

      logger.info("續期收款資訊已生成", {
        tradeNo,
        periodType: periodConfig.periodType,
        periodTimes: periodConfig.periodTimes,
        merchantId: this.merchantId,
      });

      return {
        payUrl: `${this.apiUrl}/api/period/Page`,
        data: {
          MerID: this.merchantId,
          Version: "1.0",
          EncryptInfo: encryptInfo,
          HashInfo: hashInfo,
        },
      };
    } catch (error) {
      logger.error("生成續期收款資訊失敗", {
        tradeNo,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 驗證 Webhook 資料完整性
   * @param {string} encryptInfo - 加密資料
   * @param {string} hashInfo - 雜湊值
   * @returns {boolean} 驗證結果
   */
  verifyWebhookData(encryptInfo, hashInfo) {
    try {
      // 計算預期的 Hash
      const calculatedHash = this._hash(encryptInfo);

      // 比對 Hash
      const isValid = calculatedHash === hashInfo;

      if (!isValid) {
        logger.warn("Webhook 資料驗證失敗：Hash 不符", {
          expected: calculatedHash,
          received: hashInfo,
        });
        return false;
      }

      logger.info("Webhook 資料驗證成功");
      return true;
    } catch (error) {
      logger.error("Webhook 資料驗證出錯", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * 解析 Webhook 資料
   * @param {string} encryptInfo - 加密資料
   * @returns {Object} 解密後的交易資料
   */
  parseWebhookData(encryptInfo) {
    try {
      // 解密
      const decryptedStr = this._decrypt(encryptInfo);

      // 解析查詢字串
      const webhookData = querystring.parse(decryptedStr);

      logger.info("Webhook 資料已解析", {
        ...webhookData,
        tradeNo: webhookData.MerTradeNo,
        status: webhookData.Status,
      });

      return webhookData;
    } catch (error) {
      logger.error("解析 Webhook 資料失敗", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 一次性驗證和解析 Webhook 資料
   * 結合驗證和解析的便利方法
   * @param {string} encryptInfo - 加密資料
   * @param {string} hashInfo - 雜湊值
   * @returns {Object|null} 驗證成功返回解密資料，失敗返回 null
   */
  validateAndParseWebhook(encryptInfo, hashInfo) {
    try {
      // 先驗證
      if (!this.verifyWebhookData(encryptInfo, hashInfo)) {
        logger.warn("Webhook 驗證失敗，放棄解析");
        return null;
      }

      // 再解析
      return this.parseWebhookData(encryptInfo);
    } catch (error) {
      logger.error("驗證和解析 Webhook 失敗", {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * 格式化支付回應
   * 用於將 Webhook 資料轉換為標準的支付狀態物件
   * @param {Object} webhookData - Webhook 解密後的資料
   * @returns {Object} 標準化的支付狀態
   */
  formatPaymentResponse(webhookData) {
    try {
      return {
        MerTradeNo: webhookData.MerTradeNo,      // 訂單編號
        TradeSeq: webhookData.TradeSeq,          // 交易序號
        Status: webhookData.Status,              // 訂單狀態
        Amount: webhookData.TradeAmt,            // 交易金額
        Message: webhookData.Message || "",      // 回應訊息
        TradeDate: webhookData.TradeDate,        // 交易日期
        CheckValue: webhookData.CheckValue,      // 檢查值
      };
    } catch (error) {
      logger.error("格式化支付回應失敗", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 查詢單筆訂單狀態（主動確認支付）
   * 調用 Payuni 查詢 API 以確認交易狀態
   * @param {string} merTradeNo - 商店訂單編號
   * @returns {Promise<Object>} 訂單查詢結果
   * @example
   *   const result = await sdk.queryTradeStatus('TRADE123456789');
   *   if (result.success && result.tradeStatus === 1) {
   *     // 訂單已支付
   *   }
   */
  async queryTradeStatus(merTradeNo) {
    try {
      logger.info("正在查詢訂單狀態", { merTradeNo });

      // 構建查詢參數
      const timestamp = Math.round(new Date().getTime() / 1000);
      const queryData = {
        MerID: this.merchantId,
        MerTradeNo: merTradeNo,
        Timestamp: timestamp,
      };

      // 將查詢參數加密
      const plaintext = querystring.stringify(queryData);
      const encryptInfo = this._encrypt(plaintext);
      const hashInfo = this._hash(encryptInfo);

      // 構建請求體
      const requestBody = {
        MerID: this.merchantId,
        Version: "2.0",
        EncryptInfo: encryptInfo,
        HashInfo: hashInfo,
      };

      // 發送查詢請求
      const response = await axios.post(`${this.apiUrl}/api/trade/query`, requestBody, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "payuni-sdk",
        },
        timeout: 10000, // 10 秒超時
      });

      logger.info("查詢 API 回應", {
        merTradeNo,
        status: response.data?.Status,
      });

      // 驗證回應
      if (!response.data?.Status || response.data.Status !== "SUCCESS") {
        logger.warn("查詢訂單失敗", {
          merTradeNo,
          status: response.data?.Status,
          message: response.data?.Message,
        });
        return {
          success: false,
          error: response.data?.Message || "查詢失敗",
          status: response.data?.Status,
        };
      }

      // 解密回應的 EncryptInfo
      const decryptedStr = this._decrypt(response.data.EncryptInfo);
      const resultData = querystring.parse(decryptedStr);

      logger.info("解密後的查詢結果", { resultData });

      // 驗證回應的 Hash
      const calculatedHash = this._hash(response.data.EncryptInfo);
      if (calculatedHash !== response.data.HashInfo) {
        logger.warn("查詢結果 Hash 驗證失敗", { merTradeNo });
        return {
          success: false,
          error: "查詢結果驗證失敗",
          hashMismatch: true,
        };
      }

      // 處理扁平化的結果格式：Result[0][MerTradeNo], Result[0][TradeNo] 等
      // 需要轉換為物件格式
      const tradeInfo = this._parsePayuniResult(resultData);

      if (!tradeInfo) {
        logger.warn("無法解析查詢結果", { resultData });
        return {
          success: false,
          error: "結果格式不符",
        };
      }

      logger.info("訂單查詢成功", {
        merTradeNo,
        tradeStatus: tradeInfo.tradeStatus,
        amount: tradeInfo.amount,
      });

      return {
        success: true,
        data: tradeInfo,
        rawData: resultData,
      };
    } catch (error) {
      logger.error("查詢訂單異常", {
        merTradeNo,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 解析 Payuni 扁平化的查詢結果
   * 格式：Result[0][MerTradeNo], Result[0][TradeNo] 等
   * @private
   * @param {Object} resultData - 查詢結果資料
   * @returns {Object|null} 解析後的交易信息
   */
  _parsePayuniResult(resultData) {
    try {
      // 提取 Result[0][xxx] 格式的資料
      const result = {};
      Object.keys(resultData).forEach((key) => {
        const match = key.match(/^Result\[0\]\[(\w+)\]$/);
        if (match) {
          const fieldName = match[1];
          result[fieldName] = resultData[key];
        }
      });

      logger.info("提取的結果物件", { result });

      if (Object.keys(result).length === 0) {
        logger.warn("無法從 Result[0][xxx] 中提取資料");
        return null;
      }

      // 使用提取出的結果解析
      return this._parseTradeResult(result);
    } catch (error) {
      logger.error("解析 Payuni 結果失敗", { error: error.message });
      return null;
    }
  }

  /**
   * 解析單筆交易結果
   * @private
   * @param {Object} result - 原始交易結果
   * @returns {Object} 解析後的交易信息
   */
  _parseTradeResult(result) {
    logger.info("解析交易結果", { result });
    const statusMap = {
      0: "取號成功",
      9: "未付款",
      1: "已付款",
      2: "付款失敗",
      3: "付款取消",
      4: "交易逾期",
      8: "訂單待確認",
    };

    const paymentTypeMap = {
      1: "信用卡",
      2: "ATM轉帳",
      3: "條碼/代碼",
      5: "取貨付款(超商取貨付款)",
      6: "愛金卡 (ICash)",
      7: "後支付(Aftee)",
      8: "退貨代收(C2B退貨便)",
      9: "LINEPay",
      10: "宅配到付",
      11: "街口支付",
    };

    return {
      merTradeNo: result.MerTradeNo,
      tradeNo: result.TradeNo, // Payuni 序號
      tradeStatus: parseInt(result.TradeStatus), // 訂單狀態碼
      tradeStatusText: statusMap[result.TradeStatus] || "未知狀態",
      amount: parseFloat(result.TradeAmt),
      fee: parseFloat(result.TradeFee || 0),
      paymentType: parseInt(result.PaymentType),
      paymentTypeText: paymentTypeMap[result.PaymentType] || "未知支付方式",
      paymentDay: result.PaymentDay, // 支付日期
      createDay: result.CreateDay, // 建立日期
      message: result.Message,
      dataSource: result.DataSource, // A=完整, B=處理中未完整
      isPaid: parseInt(result.TradeStatus) === 1, // 是否已支付
    };
  }

  /**
   * 批量查詢多筆訂單（如需要）
   * @param {Array<string>} merTradeNos - 訂單編號陣列
   * @returns {Promise<Array>} 查詢結果陣列
   */
  async queryMultipleTradeStatus(merTradeNos) {
    try {
      const results = [];
      for (const merTradeNo of merTradeNos) {
        const result = await this.queryTradeStatus(merTradeNo);
        results.push({
          merTradeNo,
          ...result,
        });
        // 避免請求過於頻繁，每個請求間隔 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return results;
    } catch (error) {
      logger.error("批量查詢訂單失敗", { error: error.message });
      throw error;
    }
  }

  // ========================================
  // 私有方法 - 加密/解密/Hash
  // ========================================

  /**
   * 加密資料
   * @private
   * @param {string} plaintext - 明文
   * @returns {string} 加密文本
   */
  _encrypt(plaintext) {
    try {
      const merIv = Buffer.from(this.hashIV, "utf8");
      const encryptedData = encrypt(plaintext, this.hashKey, merIv);
      return encryptedData;
    } catch (error) {
      logger.error("加密失敗", { error: error.message });
      throw error;
    }
  }

  /**
   * 解密資料
   * @private
   * @param {string} encryptedText - 加密文本
   * @returns {string} 明文
   */
  _decrypt(encryptedText) {
    try {
      const merIv = Buffer.from(this.hashIV, "utf8");
      const decryptedData = decrypt(encryptedText, this.hashKey, merIv);
      return decryptedData;
    } catch (error) {
      logger.error("解密失敗", { error: error.message });
      throw error;
    }
  }

  /**
   * 計算 Hash
   * @private
   * @param {string} encryptedText - 加密文本
   * @returns {string} Hash 值
   */
  _hash(encryptedText) {
    try {
      const merIv = Buffer.from(this.hashIV, "utf8");
      const hashValue = sha256(encryptedText, this.hashKey, merIv);
      return hashValue;
    } catch (error) {
      logger.error("Hash 計算失敗", { error: error.message });
      throw error;
    }
  }
}

// 導出單例工廠
export function createPayuniSDK(config) {
  return new PayuniSDK(config);
}

export default PayuniSDK;
