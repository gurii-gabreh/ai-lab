/*
  js/portfolio.js
  portfolio.html(一覧) / work.html(詳細、?id=xxx) の表示ロジック。
  data/portfolio.json を読み込んでレンダリングする。
*/

(function (global) {
  "use strict";

  const { loadJSON, escapeHTML, formatDate, getQueryParam } = global.AiLabCommon;

  async function renderPortfolioList() {
    const listEl = document.getElementById("portfolio-list");
    if (!listEl) return;

    const data = await loadJSON("data/portfolio.json");
    const works = (data && Array.isArray(data.works)) ? data.works : [];

    if (works.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          まだ作品はありません。<br />
          data/portfolio.json に作品を追加すると、ここに一覧表示されます。
        </div>
      `;
      return;
    }

    listEl.innerHTML = works
      .slice()
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .map((work) => `
        <a class="card" href="work.html?id=${encodeURIComponent(work.id)}">
          ${work.imageUrl
            ? `<img class="card__thumb" src="${escapeHTML(work.imageUrl)}" alt="${escapeHTML(work.title || "")}" />`
            : `<div class="card__thumb" aria-hidden="true"></div>`}
          <div class="card__meta">${formatDate(work.publishedAt)}</div>
          <h3>${escapeHTML(work.title || "")}</h3>
          <p>${escapeHTML(work.description || "")}</p>
        </a>
      `)
      .join("\n");
  }

  async function renderWorkDetail() {
    const mount = document.getElementById("work-detail");
    if (!mount) return;

    const id = getQueryParam("id");
    const data = await loadJSON("data/portfolio.json");
    const works = (data && Array.isArray(data.works)) ? data.works : [];
    const work = works.find((w) => w.id === id);

    if (!work) {
      mount.innerHTML = `
        <div class="empty-state">
          指定された作品(id=${escapeHTML(id || "")})が見つかりませんでした。<br />
          <a href="portfolio.html">作品一覧に戻る</a>
        </div>
      `;
      return;
    }

    mount.innerHTML = `
      <div class="detail-header">
        <div class="card__meta">${formatDate(work.publishedAt)}</div>
        <h1>${escapeHTML(work.title || "")}</h1>
        ${work.repoUrl ? `<p><a href="${escapeHTML(work.repoUrl)}" target="_blank" rel="noopener noreferrer">リポジトリ / デモを見る</a></p>` : ""}
      </div>
      ${work.imageUrl ? `<img src="${escapeHTML(work.imageUrl)}" alt="${escapeHTML(work.title || "")}" style="border-radius:18px;margin-bottom:1.4rem;" />` : ""}
      <div class="detail-body">${escapeHTML(work.description || "")}</div>

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

    wireLikeAndComments(work.id);
  }

  function wireLikeAndComments(workId) {
    const likeButton = document.getElementById("like-button");
    if (likeButton && global.AiLabComments) {
      likeButton.addEventListener("click", () => {
        global.AiLabComments.toggleLike(workId, likeButton);
      });
    }

    const form = document.getElementById("comment-form");
    const textarea = document.getElementById("comment-text");
    const list = document.getElementById("comment-list");
    if (form && textarea && list && global.AiLabComments) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await global.AiLabComments.submitComment(workId, textarea.value, list);
        textarea.value = "";
      });
    }
  }

  global.AiLabPortfolio = {
    renderPortfolioList,
    renderWorkDetail,
  };
})(window);
