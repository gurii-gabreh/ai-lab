// @ts-check
const { test, expect } = require("@playwright/test");

/**
 * tests/comments.spec.js
 * いいねボタンのトグル、コメント投稿フォームのDOM反映を検証する。
 *
 * data/ai-articles.json は本番用にスキーマのみ(空配列)としているため、
 * テスト用のサンプル記事1件を page.route でモック注入してから検証する。
 * GAS Webアプリへの実際のfetchは js/comments.js 側でURL未確定時に自動スキップされる
 * 設計のため、ここでは追加のネットワークモックは不要(基本設計どおり)。
 */

const MOCK_ARTICLE = {
  articles: [
    {
      id: "test-article-1",
      title: "テスト記事タイトル",
      summary: "テスト用の概要です。",
      body: "テスト用の本文です。",
      publishedAt: "2026-11-01T00:00:00+09:00",
      sourceUrl: "",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/data/ai-articles.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ARTICLE) })
  );
});

test("いいねボタンをクリックすると見た目がトグルする", async ({ page }) => {
  await page.goto("/article.html?id=test-article-1");

  const likeButton = page.locator("#like-button");
  await expect(likeButton).toHaveAttribute("data-liked", "false");

  await likeButton.click();
  await expect(likeButton).toHaveAttribute("data-liked", "true");
  await expect(likeButton.locator("[data-like-count]")).toHaveText("1");

  await likeButton.click();
  await expect(likeButton).toHaveAttribute("data-liked", "false");
  await expect(likeButton.locator("[data-like-count]")).toHaveText("0");
});

test("コメントを投稿するとDOMに追加される", async ({ page }) => {
  await page.goto("/article.html?id=test-article-1");

  const text = "これはテストコメントです";
  await page.locator("#comment-text").fill(text);
  await page.locator("#comment-form button[type=submit]").click();

  await expect(page.locator("#comment-list .comment-item")).toHaveCount(1);
  await expect(page.locator("#comment-list .comment-item")).toContainText(text);

  // 投稿後にテキストエリアがクリアされること
  await expect(page.locator("#comment-text")).toHaveValue("");
});
