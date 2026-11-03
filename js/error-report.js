/*
  js/error-report.js
  JSのエラー・例外発生時に、コンソール出力に加えてGASの新しいaction(logError)へ送信するための
  共通モジュール。

  背景・経緯:
  - progress-tracker-dashboard側に、このai-labリポジトリ自身の data/error-log.json を
    raw.githubusercontent.com経由で読み取り表示するビューアーが実装済み(別リポジトリ側の実装)。
  - ai-lab側はこのファイルへの書き込み(スキーマを守ること)だけに専念すればよい、という
    役割分担のため、本モジュールはGASへ送信するだけで、error-log.json自体の読み込み・表示は行わない。
  - common.js(loadJSON)・research-feed.js(fetchCuratedResearchItems)・common.js(postToGas、
    comments.jsのaddComment/toggleLike/editComment/deleteComment/changePassword共通経路)の
    catchブロックから呼び出される想定。
  - GAS_WEBAPP_URLが未確定の間は、common.js の postToGas が自動的にネットワーク呼び出しをスキップする
    (既存のsubmitComment/toggleLikeと同じフォールバック)。本モジュールはそのpostToGasを呼ぶだけなので、
    追加の分岐は不要。
*/

(function (global) {
  "use strict";

  /**
   * エラーを記録する。GAS側の data/error-log.json スキーマ
   * ({ id, title, category, summary, resolution, status, createdAt }) のうち、
   * title/category/summaryをここから送り、残りはGAS側で付与する。
   *
   * @param {string} title - エラー発生箇所から自動生成する簡潔な見出し
   * @param {string} category - 分類(例: "data-fetch", "gas-call" 等)
   * @param {string} summary - エラー内容の詳細(メッセージ・ステータス等)
   */
  async function reportError(title, category, summary) {
    // 画面を壊さないフェイルセーフの挙動を維持するため、まず必ずコンソールへ出力する
    console.error("[AiLabErrorReport]", title, category, summary);

    if (!global.AiLabCommon || typeof global.AiLabCommon.postToGas !== "function") {
      // common.js未読み込みのページ・タイミングでは送信をスキップし、console出力のみで済ませる
      console.warn("[AiLabErrorReport] AiLabCommon.postToGas is not available. Skipping GAS report.");
      return { ok: false, error: "AiLabCommon.postToGas unavailable" };
    }

    try {
      return await global.AiLabCommon.postToGas("logError", {
        title: String(title || "unknown error"),
        category: String(category || "uncategorized"),
        summary: String(summary || ""),
      });
    } catch (err) {
      // エラーログの送信自体に失敗した場合も、画面には影響させずconsoleのみに留める
      console.error("[AiLabErrorReport] failed to report error:", err);
      return { ok: false, error: String(err) };
    }
  }

  global.AiLabErrorReport = {
    reportError,
  };
})(window);
