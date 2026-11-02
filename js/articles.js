/*
  js/articles.js
  articles.html(一覧) / article.html(詳細、?id=xxx) の表示ロジック。
  data/ai-articles.json を読み込んでレンダリングする。
*/

(function (global) {
  "use strict";

  const { loadJSON, escapeHTML, formatDate, getQueryParam } = global.AiLabCommon;

  async function renderArticleList() {
    const listEl = document.getElementById("article-list");
    if (!listEl) return;

    const data = await loadJSON("data/ai-articles.json");
    const articles = (data && Array.isArray(data.articles)) ? data.articles : [];

    if (articles.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          まだ記事はありません。<br />
          data/ai-articles.json に記事を追加すると、ここに一覧表示されます。
        </div>
      `;
    } else {
      listEl.innerHTML = articles
        .slice()
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
        .map((article) => `
          <a class="card" href="article.html?id=${encodeURIComponent(article.id)}">
            <div class="card__thumb" aria-hidden="true"></div>
            <div class="card__meta">${formatDate(article.publishedAt)}</div>
            <h3>${escapeHTML(article.title || "")}</h3>
            <p>${escapeHTML(article.summary || "")}</p>
          </a>
        `)
        .join("\n");
    }

    renderResearchFeed();
  }

  async function renderResearchFeed() {
    const feedEl = document.getElementById("research-feed-list");
    if (!feedEl || !global.AiLabResearchFeed) return;

    feedEl.innerHTML = `<p class="section-subtitle">読み込み中...</p>`;
    const items = await global.AiLabResearchFeed.fetchCuratedResearchItems(6);

    if (items.length === 0) {
      feedEl.innerHTML = `
        <div class="empty-state">
          servicenow-sub-agent の research-items.json からキュレーション済みの項目を
          取得できませんでした(未取得 or ネットワーク制限の可能性があります)。
        </div>
      `;
      return;
    }

    feedEl.innerHTML = items
      .map((item) => `
        <div class="research-feed-item">
          <div class="research-feed-item__cat">${escapeHTML(global.AiLabResearchFeed.categoryLabel(item.category))}</div>
          <strong>${escapeHTML(item.title || "")}</strong>
          <p>${escapeHTML(item.summaryJa || item.rawSummary || "")}</p>
          ${item.sourceUrl ? `<a href="${escapeHTML(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">出典を見る</a>` : ""}
        </div>
      `)
      .join("\n");
  }

  async function renderArticleDetail() {
    const mount = document.getElementById("article-detail");
    if (!mount) return;

    const id = getQueryParam("id");
    const data = await loadJSON("data/ai-articles.json");
    const articles = (data && Array.isArray(data.articles)) ? data.articles : [];
    const article = articles.find((a) => a.id === id);

    if (!article) {
      mount.innerHTML = `
        <div class="empty-state">
          指定された記事(id=${escapeHTML(id || "")})が見つかりませんでした。<br />
          <a href="articles.html">記事一覧に戻る</a>
        </div>
      `;
      return;
    }

    mount.innerHTML = `
      <div class="detail-header">
        <div class="card__meta">${formatDate(article.publishedAt)}</div>
        <h1>${escapeHTML(article.title || "")}</h1>
        ${article.sourceUrl ? `<p><a href="${escapeHTML(article.sourceUrl)}" target="_blank" rel="noopener noreferrer">参照元リンク</a></p>` : ""}
      </div>
      <div class="detail-body">${escapeHTML(article.body || "")}</div>

      <div class="like-area">
        <button class="like-button" id="like-button" data-liked="false" aria-pressed="false">
          <span data-like-label>Like</span>
          <span data-like-count>0</span>
        </button>
      </div>

      <section class="comments-section">
        <h2 class="section-title">コメント</h2>
        <form class="comment-form" id="comment-form">
          <textarea id="comment-text" placeholder="コメントを入力..." required></textarea>
          <button type="submit" class="btn btn--primary">送信</button>
        </form>
        <div class="comment-list" id="comment-list"></div>
      </section>
    `;

    wireLikeAndComments(article.id);
  }

  function wireLikeAndComments(articleId) {
    const likeButton = document.getElementById("like-button");
    if (likeButton && global.AiLabComments) {
      likeButton.addEventListener("click", () => {
        global.AiLabComments.toggleLike(articleId, likeButton);
      });
    }

    const form = document.getElementById("comment-form");
    const textarea = document.getElementById("comment-text");
    const list = document.getElementById("comment-list");
    if (form && textarea && list && global.AiLabComments) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await global.AiLabComments.submitComment(articleId, textarea.value, list);
        textarea.value = "";
      });
    }
  }

  global.AiLabArticles = {
    renderArticleList,
    renderArticleDetail,
  };
})(window);
