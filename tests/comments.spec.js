// @ts-check
const { test, expect } = require("@playwright/test");

/**
 * tests/comments.spec.js
 * いいねボタンのトグル、コメント投稿フォームのDOM反映を検証する。
 *
 * data/ai-articles.json は本番用にスキーマのみ(空配列)としているため、
 * テスト用のサンプル記事1件を page.route でモック注入してから検証する。
 *
 * 2026-11-03追記: GAS_WEBAPP_URLが実際のデプロイURLに確定したため、
 * 「URL未確定時はネットワーク呼び出し自体をスキップする」という以前の前提が崩れた。
 * 確定後はjs/common.jsのpostToGasが本当にfetch()する設計のため、このテスト環境の
 * ネットワークポリシーでは外部のscript.google.comへ到達できず失敗するようになった。
 * 本番のGAS実デプロイ状況にテストの成否が依存しないよう、GASへのリクエスト自体を
 * page.routeで明示的にモックする(data/test-patterns.jsonのTP-006を更新する際の教訓)。
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
  // GASへのPOSTは常にモックし、実際のscript.google.comへは到達しない。
  await page.route("**/macros/s/**", (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, action: body.action }) });
  });
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

/**
 * パスワード方式のコメント編集・削除機能の検証(2026-11-03追加)。
 * GASへの通信はbeforeEachでモック済み(上記参照)。
 */

async function postComment(page, text) {
  await page.locator("#comment-text").fill(text);
  await page.locator("#comment-form button[type=submit]").click();
  return page.locator("#comment-list .comment-item").first();
}

test("コメント投稿直後に編集・削除用パスワードが表示される", async ({ page }) => {
  await page.goto("/article.html?id=test-article-1");

  const item = await postComment(page, "パスワード表示テスト");
  const passwordValue = item.locator("[data-password-value]");

  await expect(item.locator(".comment-item__password-display")).toContainText("編集・削除用パスワード");
  await expect(item.locator(".comment-item__password-display")).toContainText("保存しておいてください");
  await expect(passwordValue).toHaveText(/^[A-Za-z0-9]{6}$/);
});

test("編集・削除用パスワードを好きな文字列に変更できる", async ({ page }) => {
  await page.goto("/article.html?id=test-article-1");

  const item = await postComment(page, "パスワード変更テスト");
  await item.locator("[data-password-change-input]").fill("myNewPass1");
  await item.locator("[data-password-change-btn]").click();

  await expect(item.locator("[data-password-value]")).toHaveText("myNewPass1");

  // 編集フォームを開くと、変更後のパスワードが自動入力されていること(同一ブラウザのlocalStorage経由)
  await item.locator('[data-action="edit"]').click();
  await expect(item.locator("[data-password-input]")).toHaveValue("myNewPass1");
});

test("正しいパスワードでコメントを編集できる(成功パターン)", async ({ page }) => {
  await page.goto("/article.html?id=test-article-1");

  const item = await postComment(page, "編集前のコメント");

  await item.locator('[data-action="edit"]').click();
  await expect(item.locator(".comment-item__password-required")).toHaveText("このパスワードが必要です");
  // localStorageから自動入力されているため、パスワード欄を空にする必要はない
  await item.locator("[data-edit-text]").fill("編集後のコメント");
  await item.locator("[data-confirm]").click();

  await expect(item.locator("[data-comment-body]")).toHaveText("編集後のコメント");
  await expect(item.locator("[data-form-error]")).toBeHidden();
});

test("パスワードが未入力のまま編集しようとすると失敗する(失敗パターン)", async ({ page }) => {
  await page.goto("/article.html?id=test-article-1");

  const item = await postComment(page, "編集前のコメント2");

  await item.locator('[data-action="edit"]').click();
  await item.locator("[data-password-input]").fill("");
  await item.locator("[data-edit-text]").fill("変更後テキスト(反映されないはず)");
  await item.locator("[data-confirm]").click();

  await expect(item.locator("[data-form-error]")).toBeVisible();
  await expect(item.locator("[data-form-error]")).toHaveText("パスワードを入力してください。");
  // 編集が反映されていないこと
  await expect(item.locator("[data-comment-body]")).toHaveText("編集前のコメント2");
});

test("正しいパスワードでコメントを削除できる(成功パターン)", async ({ page }) => {
  await page.goto("/article.html?id=test-article-1");

  const item = await postComment(page, "削除対象コメント");

  await item.locator('[data-action="delete"]').click();
  await expect(item.locator(".comment-item__delete-confirm")).toBeVisible();
  await item.locator("[data-confirm]").click();

  await expect(page.locator("#comment-list .comment-item")).toHaveCount(0);
});

test("パスワードが未入力のまま削除しようとすると失敗し、コメントは残る(失敗パターン)", async ({ page }) => {
  await page.goto("/article.html?id=test-article-1");

  const item = await postComment(page, "削除失敗テスト");

  await item.locator('[data-action="delete"]').click();
  await item.locator("[data-password-input]").fill("");
  await item.locator("[data-confirm]").click();

  await expect(item.locator("[data-form-error]")).toBeVisible();
  await expect(page.locator("#comment-list .comment-item")).toHaveCount(1);
});

test("投稿から1時間を超えると編集・削除ボタンが非表示になる", async ({ page }) => {
  // Playwright の Clock API で時刻を固定し、投稿後に1時間1分進めることで
  // 「1時間を超えたら非表示にする」サーバー負荷軽減ロジックを検証する。
  await page.clock.install({ time: new Date("2026-11-01T00:00:00+09:00") });
  await page.goto("/article.html?id=test-article-1");

  const item = await postComment(page, "1時間経過テスト");
  await expect(item.locator('[data-action="edit"]')).toBeVisible();
  await expect(item.locator('[data-action="delete"]')).toBeVisible();

  // 1時間1分進める(js/comments.js側は30秒おきに再チェックするタイマーを持つ)
  await page.clock.fastForward("01:01:00");

  await expect(item.locator('[data-action="edit"]')).toHaveCount(0);
  await expect(item.locator('[data-action="delete"]')).toHaveCount(0);
});
