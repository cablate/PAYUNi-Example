const chalk = require("chalk");
const figlet = require("figlet");

/**
 * 列印美化的啟動訊息
 */
function printStartupBanner() {
  // 用分隔線而不是清除螢幕
  console.log("\n" + "=".repeat(60));

  const banner = figlet.textSync("PAYUNI", {
    font: "Standard",
    horizontalLayout: "default",
  });

  console.log(chalk.cyan(banner));
  console.log(chalk.bgBlue.white.bold("  Payment Gateway Testing Server  "));
  console.log("=".repeat(60) + "\n");
}

/**
 * 列印環境變數配置
 */
function printEnvironmentConfig(config) {
  console.log(chalk.yellow.bold("📋 環境變數配置：\n"));

  const configItems = [
    { key: "PAYUNI_API_URL", value: config.PAYUNI_API_URL, icon: "🔗" },
    { key: "PAYUNI_MERCHANT_ID", value: config.PAYUNI_MERCHANT_ID, icon: "🏪" },
    { key: "PAYUNI_HASH_KEY", value: `${config.PAYUNI_HASH_KEY?.substring(0, 10) || "未設定"}...`, icon: "🔑" },
    { key: "PAYUNI_HASH_IV", value: `${config.PAYUNI_HASH_IV?.substring(0, 10) || "未設定"}...`, icon: "🔐" },
    { key: "TURNSTILE_SECRET_KEY", value: `${config.TURNSTILE_SECRET_KEY?.substring(0, 10) || "未設定"}...`, icon: "🛡️" },
    { key: "LOG_LEVEL", value: config.LOG_LEVEL || "info (預設)", icon: "📊" },
    { key: "NODE_ENV", value: config.NODE_ENV || "development (預設)", icon: "🎯" },
  ];

  configItems.forEach(({ icon, key, value }) => {
    console.log(`  ${icon}  ${chalk.green(key)}: ${chalk.white(value)}`);
  });

  console.log();
}

/**
 * 列印成功訊息
 */
function printSuccess(port) {
  console.log(chalk.green.bold("\n✅ 伺服器啟動成功！\n"));
  console.log(chalk.bgGreen.black.bold(`  🚀 http://localhost:${port}  \n`));
  console.log(chalk.gray("等待連線...") + "\n");
}

/**
 * 列印警告訊息
 */
function printWarning(message) {
  console.log(chalk.yellow.bold("\n⚠️  警告：\n"));
  console.log(chalk.yellow(`  ${message}\n`));
}

/**
 * 列印錯誤訊息
 */
function printError(message) {
  console.error(chalk.red.bold("\n❌ 錯誤：\n"));
  console.error(chalk.red(`  ${message}\n`));
}

module.exports = {
  printStartupBanner,
  printEnvironmentConfig,
  printSuccess,
  printWarning,
  printError,
};
