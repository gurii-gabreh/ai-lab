/*
  js/common.js
  AI Lab の3ページ(index.html / articles.html / portfolio.html、
  および詳細ページ article.html / work.html)で共有する共通コンポーネント。

  なぜ分離したか:
  - ヘッダー・ナビゲーション・プロフィール要約を複数ページに直接HTMLで複製すると、
    文言やリンクを変更するたびに全ページを修正する必要があり保守コストが高い。
  - このモジュールが生成するマークアップを各ページの `<div id="site-header"></div>`
    `<div id="site-footer"></div>` に差し込むことで、1箇所の変更が全ページへ反映される。

  提供する関数:
  - AiLabCommon.renderHeader(activePage): ヘッダー/ナビをレンダリングし、現在ページをハイライト
  - AiLabCommon.renderFooter(): フッターをレンダリング
  - AiLabCommon.loadJSON(path): fetch + JSON.parse のラッパー(エラー時はnullを返す)
  - AiLabCommon.getQueryParam(name): URLクエリパラメータ取得
  - AiLabCommon.escapeHTML(str): XSS対策の簡易エスケープ(コメント本文などユーザー入力の表示に使用)
  - AiLabCommon.formatDate(isoString): 表示用の日付フォーマット
*/

(function (global) {
  "use strict";

  const NAV_ITEMS = [
    { key: "home", label: "Top", href: "index.html" },
    { key: "articles", label: "AI Articles", href: "articles.html" },
    { key: "portfolio", label: "Portfolio", href: "portfolio.html" },
  ];

  function renderHeader(activePage) {
    const mount = document.getElementById("site-header");
    if (!mount) return;

    const navHtml = NAV_ITEMS.map((item) => {
      const activeClass = item.key === activePage ? " is-active" : "";
      return `<a href="${item.href}" class="${activeClass.trim()}">${item.label}</a>`;
    }).join("\n");

    mount.innerHTML = `
      <div class="site-header__inner">
        <a href="index.html" class="brand">
          <span class="brand__mark">AI</span>
          <span class="brand__gradient-text">AI Lab</span>
        </a>
        <nav class="nav" id="primary-nav">${navHtml}</nav>
        <button class="nav-toggle" id="nav-toggle" aria-label="メニューを開く" aria-expanded="false">&#9776;</button>
      </div>
    `;

    const toggle = document.getElementById("nav-toggle");
    const nav = document.getElementById("primary-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", () => {
        const isOpen = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
    }
  }

  function renderFooter() {
    const mount = document.getElementById("site-footer");
    if (!mount) return;
    const year = new Date().getFullYear();
    mount.innerHTML = `
      <p>&copy; ${year} AI Lab. Built with vanilla JS &amp; a lot of curiosity about AI.</p>
    `;
  }

  async function loadJSON(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn("[AiLabCommon] loadJSON failed:", path, err);
      return null;
    }
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function escapeHTML(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
  }

  global.AiLabCommon = {
    renderHeader,
    renderFooter,
    loadJSON,
    getQueryParam,
    escapeHTML,
    formatDate,
  };
})(window);
