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
  - AiLabCommon.postToGas(action, payload) / isGasUrlConfigured() / GAS_WEBAPP_URL:
    GAS Webアプリへのaction付きPOSTの共通処理(エラーログ機能追加時にcomments.jsから移設。
    経緯は下記コメント参照)。

  GAS連携エントリポイントをcomments.jsからcommon.jsへ移設した理由(2026-11-03、エラーログ機能追加時の判断):
  - 追加したエラーログ機能(js/error-report.js)は、コメント機能を持たない一覧ページ
    (index.html / articles.html / portfolio.html)からもGASへ`logError`actionを送信する必要がある。
  - これらのページはcomments.jsを読み込んでいないため、GAS_WEBAPP_URL/postToGasがcomments.js内に
    閉じていると共有できない。全ページで読み込まれるcommon.jsへ一元化することで、
    「GASエンドポイントは1箇所で管理する」という既存の設計意図(コメントのGAS_WEBAPP_URL定数)を
    崩さずに済む(CLAUDE.mdルール23: 新しい仕組みを増やす前に既存の仕組みの改修で解決する)。
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
      if (!res.ok) {
        console.warn("[AiLabCommon] loadJSON received non-OK response:", path, res.status);
        reportErrorIfAvailable_("JSON読み込み失敗: " + path, "data-fetch", "HTTP " + res.status);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn("[AiLabCommon] loadJSON failed:", path, err);
      reportErrorIfAvailable_("JSON読み込み失敗: " + path, "data-fetch", String(err));
      return null;
    }
  }

  // TODO: GAS Webアプリをデプロイ後、実際のURLに置き換える(comments.js/error-report.js共通)
  // 2026-11-07、新しいデプロイ(新バージョンではなく新規デプロイのためURLが変わった)に合わせて更新。
  // GitHub Tokenも設定済みで、GAS側の実際の書き込み処理(writeGitHubJsonFile_)も有効化済み。
  const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbw4ViCPan8Ivkf0oP2tMdWw6NKPWXtCNCME6VSYxh4Cs9fHMDXmof3vBVkXXdOEm84/exec";

  function isGasUrlConfigured() {
    return typeof GAS_WEBAPP_URL === "string" && !GAS_WEBAPP_URL.includes("TODO_DEPLOYMENT_ID");
  }

  /**
   * GASへ action 付きでPOSTする。GAS_WEBAPP_URLが未確定の間はネットワーク呼び出しをスキップし、
   * 呼び出し元には「ローカル処理のみ成功した」ことを示す疑似レスポンスを返す。
   * (元 js/comments.js にあった実装。エラーログ機能追加に伴い全ページ共通のcommon.jsへ移設した)
   */
  async function postToGas(action, payload) {
    if (!isGasUrlConfigured()) {
      console.warn(
        "[AiLabCommon] GAS_WEBAPP_URL is still a TODO placeholder. Skipping network call for action:",
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
      console.error("[AiLabCommon] postToGas error:", err);
      // logError自身の送信失敗を再度reportErrorすると無限ループになるため、logError以外のみ記録する
      if (action !== "logError") {
        reportErrorIfAvailable_("GAS呼び出し失敗: " + action, "gas-call", String(err));
      }
      return { ok: false, error: String(err) };
    }
  }

  /**
   * js/error-report.js が読み込まれている場合のみエラーを記録する(読み込み順に依存しないための
   * 安全策。未読み込みのページ・読み込み前のタイミングでは単にconsole出力のみで済ませる)。
   */
  function reportErrorIfAvailable_(title, category, summary) {
    if (global.AiLabErrorReport && typeof global.AiLabErrorReport.reportError === "function") {
      global.AiLabErrorReport.reportError(title, category, summary);
    }
  }

  /**
   * テキストをクリップボードにコピーする(2026-11-07追加、画像生成プロンプトのコピー機能用)。
   * navigator.clipboard が使えない/拒否された環境向けに、非表示textarea+execCommandへ
   * フォールバックする。成功/失敗をboolean(Promise)で返す。
   */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn("[AiLabCommon] navigator.clipboard failed, falling back:", err);
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch (err) {
      console.error("[AiLabCommon] copyToClipboard fallback failed:", err);
      return false;
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
    postToGas,
    isGasUrlConfigured,
    copyToClipboard,
    GAS_WEBAPP_URL,
  };
})(window);
