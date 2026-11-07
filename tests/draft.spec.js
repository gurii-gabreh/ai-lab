// @ts-check
const { test, expect } = require("@playwright/test");

/**
 * tests/draft.spec.js
 * draft.html(開発用の記事作成ツール)の「プレビュー」機能を検証する。
 * 下書き入力→プレビューボタン→本番と同じarticle.htmlテンプレートで新しいタブに
 * 表示されること(ユーザー指示「プレビュー押したら、ブログに乗せる記事を出すように変えて」の
 * 実現確認)、SNS投稿文の下書きプレビューが入力に連動して更新されることを確認する。
 */

test("draft.html はエラー無く表示される", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto("/draft.html");
  await expect(page.locator(".site-header")).toBeVisible();
  await expect(page.locator(".site-footer")).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("下書きを入力してプレビューを押すと、本番と同じテンプレートで新しいタブに表示される", async ({ page, context }) => {
  await page.goto("/draft.html");

  await page.fill("#draft-title", "プレビュー確認用タイトル");
  await page.fill("#draft-summary", "プレビュー確認用の概要文です。");
  await page.fill("#draft-body", "1段落目。\n\n2段落目。");
  await page.fill("#draft-source-url", "https://example.com/source");

  const [previewPage] = await Promise.all([
    context.waitForEvent("page"),
    page.click("#draft-preview-button"),
  ]);
  await previewPage.waitForLoadState("networkidle");

  await expect(previewPage.locator(".draft-preview-badge")).toBeVisible();
  await expect(previewPage.locator("h1")).toHaveText("プレビュー確認用タイトル");
  await expect(previewPage.locator(".detail-body")).toContainText("1段落目。");
  await expect(previewPage.locator(".detail-body")).toContainText("2段落目。");
  await expect(previewPage.locator(".like-area")).toBeVisible();
  await expect(previewPage.locator(".comments-section")).toBeVisible();
});

test("SNS投稿文を入力すると下書きプレビュー欄に反映される", async ({ page }) => {
  await page.goto("/draft.html");

  await page.fill("#draft-sns-text", "テスト投稿文 #AILab");
  await expect(page.locator("#sns-draft-preview-body")).toHaveText("テスト投稿文 #AILab");
});

test("画像生成プロンプトをdraft.htmlでコピーできる(API課金無しでGeminiアプリへ手動貼付する運用)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/draft.html");

  const prompt = "ダークな配色のテック系ブログのアイキャッチ画像を作成してください。";
  await page.fill("#draft-image-prompt", prompt);
  await page.click("#draft-image-prompt-copy-button");

  await expect(page.locator("#draft-image-prompt-copy-button")).toHaveText("コピーしました");
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(prompt);
});

test("画像生成プロンプトを入力して下書きプレビューを開くと、プレビュー画面側にもコピーボタンが表示される", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/draft.html");

  const prompt = "暗い紫〜シアンのグラデーション背景に、AIチップのアイコンを中央に配置した画像。";
  await page.fill("#draft-title", "プロンプト確認用タイトル");
  await page.fill("#draft-image-prompt", prompt);

  const [previewPage] = await Promise.all([
    context.waitForEvent("page"),
    page.click("#draft-preview-button"),
  ]);
  await previewPage.waitForLoadState("networkidle");

  await expect(previewPage.locator("#image-prompt-text")).toHaveText(prompt);
  await previewPage.click("#image-prompt-copy-button");
  await expect(previewPage.locator("#image-prompt-copy-button")).toHaveText("コピーしました");
  const clipboardText = await previewPage.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(prompt);
});
