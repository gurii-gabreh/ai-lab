/*
  js/draft.js
  draft.html(開発用の記事作成ツール)専用のロジック。
  ナビゲーションからはリンクされておらず、ユーザーとClaude Codeの開発作業時のみ使う想定
  (2026-11-07、ユーザー指示「プレビュー押したら、ブログに乗せる記事を出すように変えて」への対応)。

  「プレビュー」は下書きをGitHubへ保存せず、localStorage経由でarticle.htmlへ渡し、
  本番と全く同じテンプレート・CSSで表示する(別タブ)。公開時は、この下書き内容をもとに
  実際にdata/ai-articles.jsonへ追記する作業を別途行う。
*/

(function (global) {
  "use strict";

  const DRAFT_PREVIEW_STORAGE_KEY = "ailabDraftPreview";

  function init() {
    const previewButton = document.getElementById("draft-preview-button");
    if (previewButton) {
      previewButton.addEventListener("click", handlePreviewClick_);
    }

    const snsTextarea = document.getElementById("draft-sns-text");
    if (snsTextarea) {
      snsTextarea.addEventListener("input", updateSnsPreview_);
      updateSnsPreview_();
    }
  }

  function handlePreviewClick_() {
    const title = getValue_("draft-title");
    const summary = getValue_("draft-summary");
    const body = getValue_("draft-body");
    const sourceUrl = getValue_("draft-source-url");

    const draft = {
      title: title,
      summary: summary,
      body: body,
      sourceUrl: sourceUrl,
      publishedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(DRAFT_PREVIEW_STORAGE_KEY, JSON.stringify(draft));
    } catch (err) {
      console.error("[AiLabDraft] failed to save draft preview:", err);
      window.alert("プレビューの保存に失敗しました(ブラウザのlocalStorageが使えない可能性があります)。");
      return;
    }

    window.open("article.html?draftPreview=1", "_blank", "noopener");
  }

  function updateSnsPreview_() {
    const text = getValue_("draft-sns-text");
    const previewBody = document.getElementById("sns-draft-preview-body");
    if (!previewBody) return;
    previewBody.textContent = text || "(ここに入力内容のプレビューが表示されます)";
  }

  function getValue_(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }

  global.AiLabDraft = { init };
})(window);
