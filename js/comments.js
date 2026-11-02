/*
  js/comments.js
  コメント・いいね機能の共通モジュール。article.html / work.html の両方の詳細ページから
  同じ関数(submitComment / toggleLike)で呼び出せるようにする。

  GAS Webアプリ連携について(TODO):
  - GASのWebアプリURLはまだデプロイ・確定していないため、GAS_WEBAPP_URL はダミー値のままにしている。
  - 実際のURLが確定したら、下記 GAS_WEBAPP_URL を書き換えるだけで本番連携が有効になる想定。
  - URLがダミーのままの間は、ネットワーク呼び出しを行わず「ローカル(楽観的)更新のみ」で動作する。
    これにより、Playwright等の自動テストもネットワーク・GAS側の実装を待たずに
    「クリックで見た目が変わる」「送信でDOMに追加される」という挙動を検証できる。
  - 対応するGASスケルトンは gas/Code.gs を参照(doPost(e) で action 別に分岐する想定)。
*/

(function (global) {
  "use strict";

  // TODO: GAS Webアプリをデプロイ後、実際のURLに置き換える
  const GAS_WEBAPP_URL = "https://script.google.com/macros/s/TODO_DEPLOYMENT_ID/exec";

  function isGasUrlConfigured() {
    return typeof GAS_WEBAPP_URL === "string" && !GAS_WEBAPP_URL.includes("TODO_DEPLOYMENT_ID");
  }

  function fireGtagEvent(eventName, params) {
    if (typeof global.gtag === "function") {
      global.gtag("event", eventName, params || {});
    } else {
      console.info("[AiLabComments] gtag not loaded, skip event:", eventName, params);
    }
  }

  /**
   * GASへ action 付きでPOSTする。GAS_WEBAPP_URLが未確定の間はネットワーク呼び出しをスキップし、
   * 呼び出し元には「ローカル処理のみ成功した」ことを示す疑似レスポンスを返す。
   */
  async function postToGas(action, payload) {
    if (!isGasUrlConfigured()) {
      console.warn(
        "[AiLabComments] GAS_WEBAPP_URL is still a TODO placeholder. Skipping network call for action:",
        action
      );
      return { ok: true, skipped: true };
    }

    try {
      const res = await fetch(GAS_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ action: action }, payload)),
      });
      if (!res.ok) throw new Error("GAS request failed: " + res.status);
      return await res.json();
    } catch (err) {
      console.error("[AiLabComments] postToGas error:", err);
      return { ok: false, error: String(err) };
    }
  }

  /**
   * コメントを投稿する。
   * @param {string} itemId - 記事ID or 作品ID
   * @param {string} text - コメント本文
   * @param {HTMLElement} [listEl] - 追記先のコメント一覧要素(渡されればDOMへ楽観的に追加)
   * @returns {Promise<{ok: boolean}>}
   */
  async function submitComment(itemId, text, listEl) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
      return { ok: false, error: "empty" };
    }

    const commentRecord = {
      id: "local-" + Date.now(),
      itemId: itemId,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    // 楽観的UI更新: GASの応答を待たずに即座にDOMへ反映する
    if (listEl) {
      const el = document.createElement("div");
      el.className = "comment-item";
      el.innerHTML = `
        <div class="comment-item__meta">${global.AiLabCommon ? global.AiLabCommon.formatDate(commentRecord.createdAt) : commentRecord.createdAt}</div>
        <div class="comment-item__body">${global.AiLabCommon ? global.AiLabCommon.escapeHTML(trimmed) : trimmed}</div>
      `;
      listEl.prepend(el);
    }

    fireGtagEvent("comment_submit", { item_id: itemId, char_count: trimmed.length });

    const result = await postToGas("addComment", { itemId: itemId, text: trimmed });
    return result;
  }

  /**
   * いいねをトグルする。
   * @param {string} itemId - 記事ID or 作品ID
   * @param {HTMLElement} [buttonEl] - いいねボタン要素(渡されれば見た目をトグル)
   * @returns {Promise<{ok: boolean, liked: boolean}>}
   */
  async function toggleLike(itemId, buttonEl) {
    let liked = false;
    let count = null;

    if (buttonEl) {
      const current = buttonEl.getAttribute("data-liked") === "true";
      liked = !current;
      buttonEl.setAttribute("data-liked", String(liked));
      buttonEl.setAttribute("aria-pressed", String(liked));

      const countEl = buttonEl.querySelector("[data-like-count]");
      if (countEl) {
        const currentCount = parseInt(countEl.textContent, 10) || 0;
        count = liked ? currentCount + 1 : Math.max(0, currentCount - 1);
        countEl.textContent = String(count);
      }

      const labelEl = buttonEl.querySelector("[data-like-label]");
      if (labelEl) {
        labelEl.textContent = liked ? "Liked" : "Like";
      }
    }

    fireGtagEvent("like_click", { item_id: itemId, liked: liked });

    const result = await postToGas("toggleLike", { itemId: itemId, liked: liked });
    return Object.assign({ liked: liked, count: count }, result);
  }

  global.AiLabComments = {
    submitComment,
    toggleLike,
    GAS_WEBAPP_URL,
    isGasUrlConfigured,
  };
})(window);
