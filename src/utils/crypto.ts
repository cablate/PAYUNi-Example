import crypto from "crypto";

export function encrypt(plaintext: string, key: Buffer, iv: Buffer): string {
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let cipherText = cipher.update(plaintext, "utf8", "base64");
  cipherText += cipher.final("base64");
  const tag = cipher.getAuthTag().toString("base64");
  return Buffer.from(`${cipherText}:::${tag}`).toString("hex").trim();
}

export function sha256(encryptStr: string, key: string, iv: string): string {
  const hash = crypto.createHash("sha256").update(`${key}${encryptStr}${iv}`);
  return hash.digest("hex").toUpperCase();
}

export function decrypt(encryptStr: string, key: Buffer, iv: Buffer): string {
  const [encryptData, tag] = Buffer.from(encryptStr, "hex").toString().split(":::");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  let decipherText = decipher.update(encryptData, "base64", "utf8");
  decipherText += decipher.final("utf8");
  return decipherText;
}
