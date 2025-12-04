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
import { decrypt, encrypt, sha256 } from "@/utils/crypto";
import logger from "@/utils/logger";

interface SDKConfig {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  apiUrl: string;
  notifyUrl?: string;
}

interface Product {
  id?: string;
  name: string;
  price: number;
  periodConfig?: any;
}

interface TradeInfo {
  merTradeNo: string;
  tradeNo: string;
  tradeStatus: number;
  tradeStatusText: string;
  amount: number;
  fee: number;
  paymentType: number;
  paymentTypeText: string;
  paymentDay: string;
  createDay: string;
  message: string;
  dataSource: string;
  isPaid: boolean;
}

interface ModifyPeriodStatusOptions {
  reviseTradeStatus: string;
  periodTradeNo: string;
  merTradeNo?: string;
  periodOrderNo?: number | string;
}

export class PayuniSDK {
  private merchantId: string;
  private hashKey: string;
  private hashIV: string;
  private apiUrl: string;
  private notifyUrl?: string;

  /**
   * 初始化 SDK
   * @param {Object} config - 配置物件
   * @param {string} config.merchantId - 商家ID
   * @param {string} config.hashKey - Hash 密鑰
   * @param {string} config.hashIV - Hash IV
   * @param {string} config.apiUrl - PayUNi API URL
   * @param {string} config.notifyUrl - Webhook 通知 URL
   */
  constructor(config: SDKConfig) {
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
  generatePaymentInfo(tradeNo: string, product: Product, userEmail: string, returnUrl: string): any {
    try {
      const timestamp = Math.round(new Date().getTime() / 1000);

      // 構建交易資料
      const tradeData: any = {
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
        Credit: 1
      };

      // 使用共用方法生成加密和 Hash
      const { encryptInfo, hashInfo } = this._encryptAndHash(tradeData);

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
    } catch (error: any) {
      logger.error("生成支付資訊失敗", {
        tradeNo,
        errorMessage: error.message,
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
  generatePeriodPaymentInfo(tradeNo: string, product: Product, userEmail: string, returnUrl: string): any {
    try {
      const { periodConfig } = product;

      if (!periodConfig) {
        throw new Error("商品缺少 periodConfig 配置");
      }

      // 構建續期收款資料
      const periodData: any = {
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

      // 使用共用方法生成加密和 Hash
      const { encryptInfo, hashInfo } = this._encryptAndHash(periodData);

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
    } catch (error: any) {
      logger.error("生成續期收款資訊失敗", {
        tradeNo,
        errorMessage: error.message,
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
  verifyWebhookData(encryptInfo: string, hashInfo: string): boolean {
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
    } catch (error: any) {
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
  parseWebhookData(encryptInfo: string): any {
    try {
      // 解密
      const decryptedStr = this._decrypt(encryptInfo);

      // 解析查詢字串
      const webhookData = querystring.parse(decryptedStr);

      logger.info("Webhook 資料已解析", {
        ...webhookData,
        tradeNo: (webhookData as any).MerTradeNo,
        status: (webhookData as any).Status,
      });

      return webhookData;
    } catch (error: any) {
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
  validateAndParseWebhook(encryptInfo: string, hashInfo: string): any {
    try {
      // 先驗證
      if (!this.verifyWebhookData(encryptInfo, hashInfo)) {
        logger.warn("Webhook 驗證失敗，放棄解析");
        return null;
      }

      // 再解析
      return this.parseWebhookData(encryptInfo);
    } catch (error: any) {
      logger.error("驗證和解析 Webhook 失敗", {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * 查詢單筆訂單狀態（主動確認支付）
   * 調用 Payuni 查詢 API 以確認交易狀態
   * @param {string} merTradeNo - 商店訂單編號
   * @returns {Promise<Object>} 訂單查詢結果
   */
  async queryTradeStatus(merTradeNo: string): Promise<any> {
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
    } catch (error: any) {
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
  private _parsePayuniResult(resultData: any): TradeInfo | null {
    try {
      // 提取 Result[0][xxx] 格式的資料
      const result: any = {};
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
    } catch (error: any) {
      logger.error("解析 Payuni 結果失敗", { errorMessage: error.message });
      return null;
    }
  }

  /**
   * 解析單筆交易結果
   * @private
   * @param {Object} result - 原始交易結果
   * @returns {Object} 解析後的交易信息
   */
  private _parseTradeResult(result: any): TradeInfo {
    logger.info("解析交易結果", { result });
    const statusMap: Record<string, string> = {
      0: "取號成功",
      9: "未付款",
      1: "已付款",
      2: "付款失敗",
      3: "付款取消",
      4: "交易逾期",
      8: "訂單待確認",
    };

    const paymentTypeMap: Record<number, string> = {
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
      tradeNo: result.TradeNo,
      tradeStatus: parseInt(result.TradeStatus),
      tradeStatusText: statusMap[result.TradeStatus] || "未知狀態",
      amount: parseFloat(result.TradeAmt),
      fee: parseFloat(result.TradeFee || 0),
      paymentType: parseInt(result.PaymentType),
      paymentTypeText: paymentTypeMap[parseInt(result.PaymentType)] || "未知支付方式",
      paymentDay: result.PaymentDay,
      createDay: result.CreateDay,
      message: result.Message,
      dataSource: result.DataSource,
      isPaid: parseInt(result.TradeStatus) === 1,
    };
  }

  /**
   * 加密和生成 Hash 的共用方法
   * @private
   * @param {Object} dataObject - 要加密的資料物件
   * @returns {Object} { encryptInfo, hashInfo }
   */
  private _encryptAndHash(dataObject: any): { encryptInfo: string; hashInfo: string } {
    try {
      const plaintext = querystring.stringify(dataObject);
      const encryptInfo = this._encrypt(plaintext);
      const hashInfo = this._hash(encryptInfo);
      return { encryptInfo, hashInfo };
    } catch (error: any) {
      logger.error("加密和雜湊失敗", { errorMessage: error.message });
      throw error;
    }
  }

  /**
   * 加密資料
   * @private
   * @param {string} plaintext - 明文
   * @returns {string} 加密文本
   */
  private _encrypt(plaintext: string): string {
    try {
      const merIv = Buffer.from(this.hashIV, "utf8");
      const encryptedData = encrypt(plaintext, Buffer.from(this.hashKey), merIv);
      return encryptedData;
    } catch (error: any) {
      logger.error("加密失敗", { errorMessage: error.message });
      throw error;
    }
  }

  /**
   * 解密資料
   * @private
   * @param {string} encryptedText - 加密文本
   * @returns {string} 明文
   */
  private _decrypt(encryptedText: string): string {
    try {
      const merIv = Buffer.from(this.hashIV, "utf8");
      const decryptedData = decrypt(encryptedText, Buffer.from(this.hashKey), merIv);
      return decryptedData;
    } catch (error: any) {
      logger.error("解密失敗", { errorMessage: error.message });
      throw error;
    }
  }

  /**
   * 計算 Hash
   * @private
   * @param {string} encryptedText - 加密文本
   * @returns {string} Hash 值
   */
  private _hash(encryptedText: string): string {
    try {
      const hashValue = sha256(encryptedText, this.hashKey, this.hashIV);
      return hashValue;
    } catch (error: any) {
      logger.error("Hash 計算失敗", { errorMessage: error.message });
      throw error;
    }
  }

  /**
   * 取消續期收款（訂閱制取消）
   * 調用 PayUNi 取消續期 API
   * @param {string} periodTradeNo - 續期收款單號
   * @returns {Promise<Object>} 取消結果
   */
  async cancelPeriodPayment(periodTradeNo: string): Promise<any> {
    try {
      logger.info("正在取消續期收款", { periodTradeNo });

      // 構建取消參數
      const timestamp = Math.round(new Date().getTime() / 1000);
      const cancelData = {
        MerID: this.merchantId,
        PeriodNo: periodTradeNo,
        Timestamp: timestamp,
      };

      // 加密和簽章
      const plaintext = querystring.stringify(cancelData);
      const encryptInfo = this._encrypt(plaintext);
      const hashInfo = this._hash(encryptInfo);

      // 構建請求體
      const requestBody = {
        MerID: this.merchantId,
        Version: "2.0",
        EncryptInfo: encryptInfo,
        HashInfo: hashInfo,
      };

      // 發送取消請求
      const response = await axios.post(`${this.apiUrl}/api/period/cancel`, requestBody, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "payuni-sdk",
        },
        timeout: 10000,
      });

      logger.info("取消 API 回應", {
        periodTradeNo,
        status: response.data?.Status,
      });

      // 驗證回應
      if (!response.data?.Status || response.data.Status !== "SUCCESS") {
        logger.warn("取消續期失敗", {
          periodTradeNo,
          status: response.data?.Status,
          message: response.data?.Message,
        });
        return {
          success: false,
          error: response.data?.Message || "取消失敗",
          status: response.data?.Status,
        };
      }

      // 驗證回應的 Hash
      if (response.data.EncryptInfo && response.data.HashInfo) {
        const calculatedHash = this._hash(response.data.EncryptInfo);
        if (calculatedHash !== response.data.HashInfo) {
          logger.warn("取消結果 Hash 驗證失敗", { periodTradeNo });
          return {
            success: false,
            error: "取消結果驗證失敗",
            hashMismatch: true,
          };
        }

        // 解密回應資料
        const decryptedStr = this._decrypt(response.data.EncryptInfo);
        const resultData = querystring.parse(decryptedStr);

        logger.info("續期已成功取消", {
          periodTradeNo,
          resultData,
        });

        return {
          success: true,
          data: resultData,
          message: "續期取消成功",
        };
      }

      // 如果沒有 EncryptInfo，代表是簡單的成功回應
      logger.info("續期已成功取消", { periodTradeNo });
      return {
        success: true,
        message: "續期取消成功",
      };
    } catch (error: any) {
      logger.error("取消續期異常", {
        periodTradeNo,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 修改續期收款狀態
   * @param {Object} options
   * @param {string} options.reviseTradeStatus - suspend、restart、end、reauth
   * @param {string} options.periodTradeNo - 續期收款單號
   * @param {string} [options.merTradeNo] - 商店訂單編號
   * @param {number|string} [options.periodOrderNo] - 期數編號
   * @returns {Promise<Object>}
   */
  async modifyPeriodStatus(options: ModifyPeriodStatusOptions): Promise<any> {
    try {
      const { reviseTradeStatus, periodTradeNo, merTradeNo, periodOrderNo } = options;

      if (!reviseTradeStatus) {
        throw new Error("缺少 reviseTradeStatus 參數");
      }

      if (!periodTradeNo) {
        throw new Error("缺少 periodTradeNo 參數");
      }

      logger.info("準備修改續期收款狀態", {
        reviseTradeStatus,
        periodTradeNo,
        merTradeNo,
        periodOrderNo,
      });

      const requestBodyData: any = {
        MerID: this.merchantId,
        ReviseTradeStatus: reviseTradeStatus,
        PeriodTradeNo: periodTradeNo,
      };

      if (merTradeNo) {
        requestBodyData.MerTradeNo = merTradeNo;
      }

      if (periodOrderNo !== undefined && periodOrderNo !== null && periodOrderNo !== "") {
        requestBodyData.PeriodOrderNo = Number(periodOrderNo);
      }

      const plaintext = querystring.stringify(requestBodyData);
      const encryptInfo = this._encrypt(plaintext);
      const hashInfo = this._hash(encryptInfo);

      const requestPayload = {
        MerID: this.merchantId,
        Version: "1.0",
        EncryptInfo: encryptInfo,
        HashInfo: hashInfo,
      };

      const response = await axios.post(`${this.apiUrl}/api/period/mdfStatus`, requestPayload, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "payuni-sdk",
        },
        timeout: 10000,
      });

      logger.info("續期狀態修改 API 回應", {
        periodTradeNo,
        status: response.data?.Status,
      });

      let resultData: any = null;

      if (response.data.EncryptInfo) {
        const calculatedHash = this._hash(response.data.EncryptInfo);
        if (calculatedHash !== response.data.HashInfo) {
          logger.warn("修改狀態結果 Hash 驗證失敗", { periodTradeNo });
          return {
            success: false,
            error: "修改狀態結果驗證失敗",
            hashMismatch: true,
          };
        }

        const decryptedStr = this._decrypt(response.data.EncryptInfo);
        resultData = querystring.parse(decryptedStr);
      } else {
        // PayUNi may return plaintext Status without EncryptInfo
        resultData = {
          Status: response.data.Status,
          Message: response.data.Message,
          MerID: response.data.MerID,
        };
        if (response.data.MerTradeNo) resultData.MerTradeNo = response.data.MerTradeNo;
        if (response.data.PeriodTradeNo) resultData.PeriodTradeNo = response.data.PeriodTradeNo;
      }

      // 檢查解密後的狀態碼
      if (!resultData.Status || resultData.Status !== "SUCCESS") {
        logger.warn("修改續期狀態失敗", {
          periodTradeNo,
          status: resultData.Status,
          message: resultData.Message,
        });
        return {
          success: false,
          error: resultData.Message || "修改續期狀態失敗",
          status: resultData.Status,
        };
      }

      logger.info("續期狀態修改成功", {
        periodTradeNo,
        result: resultData,
      });

      return {
        success: true,
        message: resultData.Message || "續期狀態修改成功",
        data: resultData,
      };
    } catch (error: any) {
      logger.error("修改續期狀態異常", {
        periodTradeNo: options.periodTradeNo,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * 建立 PayuniSDK 實例的工廠函數
 *
 * @param {Object} config - 配置物件
 * @returns {PayuniSDK} PayuniSDK 實例
 * @throws {Error} 若配置不完整
 */
export function createPayuniSDK(config: SDKConfig): PayuniSDK {
  return new PayuniSDK(config);
}

export default PayuniSDK;
