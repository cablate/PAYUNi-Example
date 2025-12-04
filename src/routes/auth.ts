import { Router, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { getDatabase } from "@/services/database/provider";
import logger from "@/utils/logger";

/**
 * 安全錯誤處理工具函數
 *
 * 根據環境變數決定是否向客戶端洩露詳細錯誤資訊。
 * 在生產環境中,錯誤訊息被隱藏以保護系統安全。
 *
 * @param {Object} res - Express 回應物件
 * @param {number} statusCode - HTTP 狀態碼
 * @param {string} publicMessage - 可供公開的錯誤訊息
 * @param {Object} [logContext={}] - 額外的日誌上下文資訊
 * @returns {Object} JSON 回應物件
 *
 * @example
 * sendSecureError(res, 400, "無效的授權碼", { code: "invalid_code" });
 */
function sendSecureError(res: Response, statusCode: number, publicMessage: string, logContext: any = {}): Response {
  logger.error(publicMessage, logContext);

  if (process.env.NODE_ENV === "production") {
    return res.status(statusCode).json({
      error: "系統處理異常，請稍後再試",
      code: statusCode,
    });
  }

  return res.status(statusCode).json({
    error: publicMessage,
    ...logContext,
  });
}

/**
 * 建立 Google OAuth 認證路由
 *
 * 包含以下端點：
 * - GET /auth/google - 啟動 Google OAuth 流程
 * - GET /auth/google/callback - Google OAuth 回調處理
 * - GET /api/me - 取得當前使用者資訊
 * - GET /auth/logout - 使用者登出
 *
 * @param {OAuth2Client} oauth2Client - Google OAuth2 客戶端實例
 * @returns {Router} Express 路由物件
 *
 * @example
 * const authRoutes = createAuthRoutes(oauth2Client);
 * app.use('/', authRoutes);
 */
export function createAuthRoutes(oauth2Client: OAuth2Client): Router {
  const router = Router();

  /**
   * GET /auth/google
   * 啟動 Google OAuth 認證流程
   *
   * 導向用戶至 Google 登入頁面。用戶授權後，Google 會重導至回調路由。
   * 支持的權限範圍：
   * - userinfo.profile - 使用者基本信息（名稱、頭像等）
   * - userinfo.email - 使用者信箱
   *
   * @param {Object} req - Express 請求物件
   * @param {Object} res - Express 回應物件
   * @returns {void} 302 Found 重導至 Google OAuth 授權 URL
   *
   * @example
   * GET /auth/google
   * // 導向至 Google 授權頁面
   */
  router.get("/auth/google", (_req: Request, res: Response) => {
    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: "online",
      scope: ["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email"],
      prompt: "consent",
    });
    res.redirect(authorizeUrl);
  });

  /**
   * GET /auth/google/callback
   * Google OAuth 回調處理
   *
   * 此端點由 Google 在用戶授權後調用。負責：
   * 1. 從查詢字串中取得授權碼（authorization code）
   * 2. 使用授權碼換取 OAuth tokens
   * 3. 驗證 ID Token 的真實性
   * 4. 提取使用者信息（ID、信箱、名稱、頭像）
   * 5. 查詢或建立使用者記錄
   * 6. 取得使用者權益（訂閱狀態、購買記錄等）
   * 7. 建立 Session 以保持登入狀態
   * 8. 重導至首頁
   *
   * @async
   * @param {Object} req - Express 請求物件
   * @param {Object} req.query - 查詢字串參數
   * @param {string} req.query.code - Google 授權碼（必需）
   * @param {Object} req.session - Session 物件
   * @param {Object} res - Express 回應物件
   * @returns {Promise<void>} 302 Found 重導至首頁或錯誤頁面
   *
   * @throws {Error} 授權碼缺失、Token 驗證失敗、資料庫操作失敗等
   *
   * @example
   * // Google 進行重導
   * GET /auth/google/callback?code=4/0AXym.../scope=...
   */
  router.get("/auth/google/callback", async (req: Request, res: Response): Promise<void> => {
    try {
      const { code } = req.query;
      if (!code) {
        logger.error("Google 回調缺少授權碼");
        sendSecureError(res, 400, "Google 登入失敗：缺少授權碼");
        return;
      }

      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);

      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token as string,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      // 整合使用者資料庫
      const db = getDatabase();
      let user = await db.findUser(payload!.sub);

      if (!user) {
        // 建立新使用者
        const newUser = {
          id: payload!.sub,
          email: payload!.email,
          name: payload!.name,
          picture: payload!.picture,
        };
        await db.createUser(newUser);
        user = newUser;
      } else {
        // 更新登入時間
        await db.updateUserLogin(payload!.sub);
      }

      // 取得使用者權益
      const entitlements = await db.getUserEntitlements(payload!.sub);

      req.session.user = {
        id: payload!.sub,
        email: payload!.email!,
        name: payload!.name!,
        picture: payload!.picture!,
        entitlements: entitlements, // 儲存權益到 Session
      };

      req.session.save((err) => {
        if (err) {
          logger.error("Session 儲存失敗", { errorMessage: err.message, sessionID: req.sessionID });
          sendSecureError(res, 500, "Session 儲存失敗", { message: err.message });
          return;
        }
        logger.info("使用者登入成功並儲存 Session", { userId: payload!.sub, email: payload!.email });
        res.redirect("/");
      });
    } catch (error: any) {
      logger.error("Google 認證回調失敗", {
        errorMessage: error.message,
        stack: error.stack,
      });
      sendSecureError(res, 500, "Google 登入驗證過程中發生錯誤", { message: error.message });
    }
  });

  /**
   * GET /api/me
   * 取得當前使用者資訊
   *
   * 此端點返回當前登入使用者的資訊，包括基本資料和權益狀態。
   * 如果使用者未登入，返回 loggedIn: false。
   * 若查詢權益狀態失敗，則返回空的權益清單。
   *
   * 此端點可被前端用於：
   * - 驗證使用者登入狀態
   * - 取得使用者名稱、信箱、頭像
   * - 檢查使用者的訂閱狀態和購買權益
   * - 更新 UI 以顯示個人化內容
   *
   * @async
   * @param {Object} req - Express 請求物件
   * @param {Object} req.session.user - 當前登入使用者（如果已登入）
   * @param {Object} res - Express 回應物件
   * @returns {Promise<void>} JSON 回應
   *
   * @returns {Object} 回應資料結構
   * @returns {boolean} 回應.loggedIn - 是否已登入
   * @returns {Object} [回應.user] - 使用者資訊（僅當已登入時）
   * @returns {string} 回應.user.id - Google 使用者 ID
   * @returns {string} 回應.user.email - 使用者信箱
   * @returns {string} 回應.user.name - 使用者名稱
   * @returns {string} 回應.user.picture - 使用者頭像 URL
   * @returns {Array<Object>} 回應.user.entitlements - 使用者權益清單
   *
   * @example
   * // 已登入的回應
   * GET /api/me
   * {
   *   "loggedIn": true,
   *   "user": {
   *     "id": "google_12345",
   *     "email": "user@example.com",
   *     "name": "User Name",
   *     "picture": "https://lh3.googleusercontent.com/...",
   *     "entitlements": [
   *       { "type": "subscription", "status": "active", "productId": "pro" },
   *       { "type": "one_time", "status": "completed", "productId": "ebook" }
   *     ]
   *   }
   * }
   *
   * @example
   * // 未登入的回應
   * GET /api/me
   * {
   *   "loggedIn": false
   * }
   */
  router.get("/api/me", async (req: Request, res: Response) => {
    if (req.session.user) {
      try {
        // 每次都重新查詢最新的權益狀態
        const db = getDatabase();
        const entitlements = await db.getUserEntitlements(req.session.user.id);

        // 更新 Session 中的權益資料
        req.session.user.entitlements = entitlements;

        return res.json({ loggedIn: true, user: req.session.user });
      } catch (error: any) {
        logger.error("取得使用者權益失敗", { errorMessage: error.message });
        // 即使查詢失敗,也回傳基本使用者資訊（但沒有權益）
        return res.json({ loggedIn: true, user: { ...req.session.user, entitlements: [] } });
      }
    } else {
      return res.json({ loggedIn: false });
    }
  });

  /**
   * GET /auth/logout
   * 使用者登出
   *
   * 此端點負責清除使用者的登入狀態。流程：
   * 1. 銷毀 Session（移除伺服器端的登入資料）
   * 2. 清除 sessionId cookie
   * 3. 重導至首頁
   *
   * 登出後，使用者需要重新進行 Google OAuth 流程以登入。
   *
   * @param {Object} req - Express 請求物件
   * @param {Object} req.session - 當前 Session
   * @param {string} req.sessionID - Session ID
   * @param {Object} res - Express 回應物件
   * @returns {void} 302 Found 重導至首頁
   *
   * @example
   * GET /auth/logout
   * // 清除 Session，清除 Cookie，重導至首頁
   */
  router.get("/auth/logout", (req: Request, res: Response) => {
    logger.info("登出請求", { sessionID: req.sessionID, hasUser: !!req.session?.user });

    req.session.destroy((err) => {
      if (err) {
        logger.error("登出錯誤", { errorMessage: err.message });
        sendSecureError(res, 500, "登出時發生錯誤");
        return;
      }
      res.clearCookie("sessionId");
      logger.info("使用者登出成功");
      res.redirect("/");
    });
  });

  return router;
}
