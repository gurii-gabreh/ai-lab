// @ts-check
const { test, expect } = require("@playwright/test");

/**
 * tests/pages.spec.js
 * 各ページがエラー無く表示されること、ナビゲーションリンクが機能することを検証する。
 * research-items.json への外部fetch(research-feed.js)は環境によっては失敗することがあるため、
 * ここでは「ページ自体がJSエラーで落ちないこと」を主眼にする(失敗時はempty-stateを表示する設計)。
 */

const PAGES = [
  { path: "/index.html", title: /AI Lab/ },
  { path: "/articles.html", title: /AI Articles/ },
  { path: "/portfolio.html", title: /Portfolio/ },
];

for (const { path, title } of PAGES) {
  test(`${path} はエラー無く表示される`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator(".site-footer")).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
}

test("ナビゲーションリンクで articles.html / portfolio.html / index.html を移動できる", async ({ page }) => {
  await page.goto("/index.html");

  await page.locator(".nav a", { hasText: "AI Articles" }).click();
  await expect(page).toHaveURL(/articles\.html$/);
  await expect(page.locator("h1")).toHaveText("AI Articles");

  await page.locator(".nav a", { hasText: "Portfolio" }).click();
  await expect(page).toHaveURL(/portfolio\.html$/);
  await expect(page.locator("h1")).toHaveText("Portfolio");

  await page.locator(".nav a", { hasText: "Top" }).click();
  await expect(page).toHaveURL(/index\.html$/);
});

test("記事が存在しない場合、articles.html に空状態メッセージが表示される", async ({ page }) => {
  // data/ai-articles.json は2026-11-07に実データ投入済みのため、空状態の検証は
  // page.route で0件データをモックして行う(実データの有無に依存させない。TP-003/TP-006参照)。
  await page.route("**/data/ai-articles.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ articles: [] }) })
  );
  await page.goto("/articles.html");
  await expect(page.locator("#article-list .empty-state")).toBeVisible();
});

test("作品が存在しない場合、portfolio.html に空状態メッセージが表示される", async ({ page }) => {
  await page.goto("/portfolio.html");
  await expect(page.locator("#portfolio-list .empty-state")).toBeVisible();
});
