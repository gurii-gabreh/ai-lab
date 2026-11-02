// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * Playwright設定。
 * webServer で静的サイトを配信してから各テストを実行する(ビルドステップ不要の構成を維持するため、
 * http-serverでそのままHTMLを配信するだけ)。
 */
module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx http-server . -p 4173 -c-1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
  projects: [
    {
      name: "chromium",
      // 注: CI/サンドボックス環境ではPlaywright専用のChromiumバイナリを
      // cdn.playwright.devから取得できない場合があるため、システムにインストール済みの
      // Google Chromeを使う "chrome" channel を指定している(開発者のローカル環境で
      // 通常のPlaywright Chromiumが使える場合は channel 指定を外しても動作する)。
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
