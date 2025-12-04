# UPP Webhook 返回參數文檔

## 一、基本返回參數

| 參數 | 說明 | 備註 |
|------|------|------|
| Status | 狀態代碼 | `SUCCESS` = 成功<br>`UNKNOWN` = 等待授權結果逾期<br>`Unapproved` = 訂單待確認，買家會員資格審查中<br>失敗請參考錯誤代碼 |
| MerID | 商店代號 | - |
| Version | 版本 | 固定 `1.0` |
| EncryptInfo | 加密字串 | 請參考資料加解密 |
| HashInfo | 加密 Hash | 請參考資料加解密 |

---

## 二、EncryptInfo 加密參數

### 2.1 基本交易資訊

| 參數 | 說明 | 備註 |
|------|------|------|
| Status | 狀態代碼 | `SUCCESS` = 成功<br>`UNKNOWN` = 等待授權結果逾期<br>`UNAPPROVED` = 訂單待確認，買家會員資格審查中<br>若失敗請參考錯誤代碼 |
| Message | 狀態說明 | `授權成功` = 信用卡授權成功<br>`(CVS)建立成功` = 超商代碼取號成功<br>`(ATM)建立成功` = ATM轉帳取號成功<br>`UNKNOWN` = 系統忙碌中，尚未確認交易結果<br><br>**說明**: 當60秒無收到銀行回應會先回覆UNKNOWN，後續若有取得交易結果會Notify至NotifyURL，或建議可於15分鐘後發動交易查詢確認交易狀態 |
| MerID | 商店代號 | - |
| MerTradeNo | 商店訂單編號 | 限制長度: 25<br>格式: `[A-Za-z0-9_-]` |
| TradeNo | UNi序號 | - |
| TradeAmt | 訂單金額 | - |
| TradeStatus | 訂單狀態 | `0` = 取號成功<br>`1` = 已付款<br>`2` = 付款失敗<br>`3` = 付款取消<br>`8` = 訂單待確認 |
| PaymentType | 支付工具 | `1` = 信用卡<br>`2` = ATM轉帳<br>`3` = 代碼<br>`5` = 貨到付款(超商取貨付款)<br>`6` = 愛金卡 (ICash)<br>`7` = 後支付 (Aftee)<br>`9` = LinePay<br>`10` = 宅配到付<br>`11` = JKoPay |
| Gateway | 交易標記 | 固定 `2` = 整合式支付頁 UNiPaypage (UPP) |
| BuyerHash | 買方會員Token Hash | Token 專用返回參數。需在初次交易帶入 BuyerToken，並由買方登入或註冊買方會員，完成交易後才會取得 |

---

## 三、各支付類型專屬參數

### 3.1 信用卡 (PaymentType=1)

| 參數 | 說明 | 備註 |
|------|------|------|
| Card6No | 卡號前六碼 | - |
| Card4No | 卡號後四碼 | - |
| CardInst | 分期數 | - |
| FirstAmt | 首期金額 | - |
| EachAmt | 每期金額 | - |
| ResCode | 回應碼 | - |
| ResCodeMsg | 回應碼敘述 | - |
| AuthCode | 授權碼 | - |
| AuthBank | 授權銀行(代碼) | - |
| AuthBankName | 授權銀行(名稱) | - |
| AuthType | 授權類型 | `1` = 一次<br>`2` = 分期<br>`4` = Apple Pay<br>`5` = Google Pay<br>`6` = Samsung Pay<br>`7` = 銀聯 |
| AuthDay | 授權日期 | 格式: `YYYYMMDD` |
| AuthTime | 授權時間 | 格式: `HHIISS` |
| CreditHash | 信用卡Token Hash | Token專用返回參數<br>有 CreditToken 且授權成功才會壓碼 |
| CreditLife | 信用卡Token 有效日期 | 格式: `MMYY` |
| CardBank | 發卡銀行(代碼) | 若為國內發卡行則為銀行代碼(3碼)，若非國內發卡行則為 `-` |

---

### 3.2 虛擬帳號 (PaymentType=2)

| 參數 | 說明 | 備註 |
|------|------|------|
| BankType | 銀行(代碼) | 請參考銀行代碼(數字) |
| PayNo | 繳費虛擬帳號 | - |
| PaySet | 繳費設定 | `1` = 一次性 |
| ExpireDate | 繳費截止時間 | 格式: `YYYY-MM-DD HH:II:SS` |

---

### 3.3 超商代碼 (PaymentType=3)

| 參數 | 說明 | 備註 |
|------|------|------|
| Store | 超商(代碼) | 7-ELEVEN |
| PayNo | 繳費代碼 | - |
| ExpireDate | 繳費截止時間 | 格式: `YYYY-MM-DD HH:II:SS` |

---

### 3.4 純取貨 (ShipTag=1) / 貨到付款 (PaymentType=5)

| 參數 | 說明 | 備註 |
|------|------|------|
| PartnerId | 母代碼 | LagsType=B2C，長度限制：3 |
| ShipTradeNo | UNi物流序號 | - |
| GoodsType | 寄件型態 | `1` = 常溫<br>`2` = 冷凍 |
| LgsType | 物流型態 | `B2C` = 大宗寄倉<br>`C2C` = 店到店 |
| ShipType | 通路類別 | `1` = 7-ELEVEN |
| ServiceType | 取貨方式 | `1` = 取貨付款<br>`3` = 取貨不付款 |
| ShipAmt | 取貨付款金額 | - |
| StoreID | 取件門市代碼 | - |
| StoreName | 取件門市名稱 | - |
| StoreAddr | 取件門市地址 | - |
| Consignee | 收件人名稱 | 限制長度:10<br>最長5個中文字、最短至少2個中文字或4個英文字<br>(請填寫真實姓名，超商取件時核對身分使用) |
| ConsigneeMobile | 收件人手機號碼 | 限填手機號碼09開頭，半形數字<br>(請填寫真實手機號碼，包裹到店通知與超商取件時核對身分使用) |
| ConsigneeMail | 收件人電子信箱 | - |

---

### 3.5 愛金卡 ICash (PaymentType=6)

| 參數 | 說明 | 備註 |
|------|------|------|
| PayNo | 愛金卡交易序號 | - |
| PayTime | 付款日期時間 | 格式: `YYYY-MM-DD HH:II:SS` |

---

### 3.6 後支付 Aftee (PaymentType=7)

| 參數 | 說明 | 備註 |
|------|------|------|
| PayNo | Aftee交易序號 | - |
| CreateDT | 交易建立日期時間 | - |

---

### 3.7 LINE Pay (PaymentType=9)

| 參數 | 說明 | 備註 |
|------|------|------|
| PayNo | LINEPay交易號碼 | - |
| PayTime | 付款日期時間 | 格式: `YYYY-MM-DD HH:II:SS` |

---

### 3.8 宅配到付 (PaymentType=10)

| 參數 | 說明 | 備註 |
|------|------|------|
| TradeType | 宅配類別 | 固定 `1` = 正物流 |
| ShipTradeNo | 物流單號 | - |
| GoodsType | 寄件型態 | `1` = 常溫<br>`2` = 冷凍<br>`3` = 冷藏 |
| LgsType | 物流型態 | `HOME` = 黑貓宅配 |
| ShipType | 通路類別 | `2` = 黑貓宅配 |
| ServiceType | 取貨方式 | `1` = 取貨付款<br>`3` = 取貨不付款 |
| ShipAmt | 取貨付款金額 | - |
| Consignee | 收件人名稱 | - |
| ConsigneeMobile | 收件人手機號碼 | - |
| ConsigneeTel | 收件人聯絡電話 | 區碼+號碼<br>若有帶時，會回 `00-00000000`<br>若交易當下沒帶時，則回 `-` |
| ConsigneeAddress | 收件人地址 | - |
| DeliveryTimeTag | 希望配達時段 | `01` = 13時前<br>`02` = 14-18時<br>`04` = 不指定 |
| ProductTypeId | 商品類別代碼 | `0001` = 一般食品<br>`0002` = 名特產/甜產<br>`0003` = 酒/油/醋/醬<br>`0004` = 穀物蔬果<br>`0005` = 水產/肉品<br>`0006` = 3C<br>`0007` = 家電<br>`0008` = 服飾配件<br>`0009` = 生活用品<br>`0010` = 美容彩妝<br>`0011` = 保健食品<br>`0012` = 醫療相關用品<br>`0013` = 寵物用品飼料<br>`0014` = 印刷品<br>`0015` = 其他 |
| ProdDesc | 商品名稱 | - |

---

### 3.9 街口支付 JKoPay (PaymentType=11)

| 參數 | 說明 | 備註 |
|------|------|------|
| JKoTradeNo | JKoPay交易號碼 | - |
| JKoStrCupAmt | 店家街口券折抵 | - |
| JKoChannel | 支付工具 | `account` = 儲值帳戶<br>`bank` = 銀行帳戶<br>`creditcard` = 信用卡 |
| PayTime | 付款日期時間 | 格式: `YYYY-MM-DD HH:II:SS` |

---

## 四、快速查詢索引

### 支付類型代碼對照表

| PaymentType | 支付方式 | 章節 |
|-------------|---------|------|
| 1 | 信用卡 | [3.1](#31-信用卡-paymenttype1) |
| 2 | 虛擬帳號 | [3.2](#32-虛擬帳號-paymenttype2) |
| 3 | 超商代碼 | [3.3](#33-超商代碼-paymenttype3) |
| 5 | 貨到付款(超商取貨付款) | [3.4](#34-純取貨-shiptag1--貨到付款-paymenttype5) |
| 6 | 愛金卡 (ICash) | [3.5](#35-愛金卡-icash-paymenttype6) |
| 7 | 後支付 (Aftee) | [3.6](#36-後支付-aftee-paymenttype7) |
| 9 | LINE Pay | [3.7](#37-line-pay-paymenttype9) |
| 10 | 宅配到付 | [3.8](#38-宅配到付-paymenttype10) |
| 11 | 街口支付 (JKoPay) | [3.9](#39-街口支付-jkopay-paymenttype11) |

### 訂單狀態代碼對照表

| TradeStatus | 狀態說明 |
|-------------|---------|
| 0 | 取號成功 |
| 1 | 已付款 |
| 2 | 付款失敗 |
| 3 | 付款取消 |
| 8 | 訂單待確認 |
