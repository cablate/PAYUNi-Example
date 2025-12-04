interface PeriodConfig {
  periodType: string;
  periodDate: string;
  periodTimes: number;
  fType: string;
  fAmt: null;
  firstChargeDelayDays?: number;
}

interface TrialConfig {
  days: number;
  amount: number;
  description: string;
}

interface Product {
  id: string;
  type: string;
  name: string;
  price: number;
  period: string | null;
  description: string;
  features: string[];
  recommended: boolean;
  periodConfig?: PeriodConfig;
  trial?: TrialConfig;
  icon?: string;
  iconColor?: string;
}

const products: Product[] = [
  // --- Subscription Plans ---
  {
    id: "plan_basic",
    type: "subscription",
    name: "基礎方案",
    price: 9,
    period: "/月",
    description: "適合剛起步的個人創作者。",
    features: [
      "存取基礎內容",
      "Email 客服支援",
      "1 個使用者帳號"
    ],
    recommended: false,
    periodConfig: {
      periodType: "month",
      periodDate: "1",
      periodTimes: 12,
      fType: "build",
      fAmt: null
    }
  },
  {
    id: "plan_pro",
    type: "subscription",
    name: "專業方案",
    price: 19,
    period: "/月",
    description: "為專業人士與成長中團隊打造。",
    features: [
      "包含所有基礎功能",
      "優先客服支援",
      "5 個使用者帳號",
      "進階數據分析"
    ],
    recommended: true,
    periodConfig: {
      periodType: "month",
      periodDate: "1",
      periodTimes: 12,
      fType: "build",
      fAmt: null
    }
  },
  {
    id: "plan_monthly_trial",
    type: "subscription",
    name: "月訂方案（前 7 天免費）",
    price: 19,
    period: "/月",
    description: "月費方案，首期 7 天免費試用，提供成長中團隊彈性體驗。",
    features: [
      "首 7 天免扣款，之後每月自動收費",
      "含所有專業功能",
      "彈性取消與續訂",
      "專屬客服支援"
    ],
    recommended: false,
    trial: {
      days: 7,
      amount: 0,
      description: "首期 7 天無須付款，系統會在第 8 天扣取正式月費。"
    },
    periodConfig: {
      periodType: "month",
      periodDate: "1",
      periodTimes: 12,
      fType: "job",
      fAmt: null,
      firstChargeDelayDays: 7
    }
  },
  {
    id: "plan_enterprise",
    type: "subscription",
    name: "企業方案",
    price: 49,
    period: "/月",
    description: "針對大型組織的客製化解決方案。",
    features: [
      "包含所有專業功能",
      "24/7 專屬支援",
      "無限制帳號",
      "客製化整合服務"
    ],
    recommended: false,
    periodConfig: {
      periodType: "month",
      periodDate: "1",
      periodTimes: 12,
      fType: "build",
      fAmt: null
    }
  },

  // --- One-time Purchases ---
  {
    id: "course_fullstack",
    type: "one_time",
    name: "全端開發實戰課程",
    price: 35,
    period: null,
    description: "從零開始掌握 Node.js 與 React 開發。",
    features: [
      "20 小時高畫質影音",
      "附贈完整原始碼",
      "終身無限次觀看"
    ],
    icon: "🎓",
    iconColor: "#3B82F6",
    recommended: false,
  },
  {
    id: "pack_starter",
    type: "one_time",
    name: "開發者新手禮包",
    price: 12,
    period: null,
    description: "包含常用的 UI 元件庫與開發工具設定檔。",
    features: [
      "50+ UI Components",
      "VS Code 設定檔",
      "專屬社群邀請碼"
    ],
    icon: "🎁",
    iconColor: "#10B981",
    recommended: false,
  }
];

export default products;
