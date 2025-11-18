import { Router } from "express";
import logger from "../utils/logger.js";

/**
 * 安全錯誤處理工具函數
 */
function sendSecureError(res, statusCode, publicMessage, logContext = {}) {
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
 * 建立 Google Auth 路由
 */
export function createAuthRoutes(oauth2Client) {
  const router = Router();

  /**
   * Google OAuth 登入路由
   */
  router.get("/auth/google", (req, res) => {
    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: "online",
      scope: ["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email"],
      prompt: "consent",
    });
    res.redirect(authorizeUrl);
  });

  /**
   * Google OAuth 回調路由
   */
  router.get("/auth/google/callback", async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) {
        logger.error("Missing authorization code in callback");
        return sendSecureError(res, 400, "Google 登入失敗：缺少授權碼");
      }

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      req.session.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };

      req.session.save((err) => {
        if (err) {
          logger.error("Session save failed", { error: err.message, sessionID: req.sessionID });
          return sendSecureError(res, 500, "Session 儲存失敗", { message: err.message });
        }
        logger.info("User logged in successfully and session saved", { userId: payload.sub, email: payload.email });
        res.redirect("/");
      });
    } catch (error) {
      logger.error("Google auth callback error", {
        message: error.message,
        stack: error.stack,
      });
      sendSecureError(res, 500, "Google 登入驗證過程中發生錯誤", { message: error.message });
    }
  });

  /**
   * 取得當前使用者資訊
   */
  router.get("/api/me", (req, res) => {
    if (req.session.user) {
      res.json({ loggedIn: true, user: req.session.user });
    } else {
      res.json({ loggedIn: false });
    }
  });

  /**
   * 登出路由
   */
  router.get("/auth/logout", (req, res) => {
    logger.info("Logout requested", { sessionID: req.sessionID, hasUser: !!req.session?.user });

    req.session.destroy((err) => {
      if (err) {
        logger.error("Logout error", { error: err.message });
        return sendSecureError(res, 500, "登出時發生錯誤");
      }
      res.clearCookie("sessionId");
      logger.info("User logged out successfully");
      res.redirect("/");
    });
  });

  return router;
}
