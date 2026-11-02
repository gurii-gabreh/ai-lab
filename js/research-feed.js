/*
  js/research-feed.js
  articles.html の「最新AI研究フィード」セクション用。

  servicenow-sub-agent リポジトリの data/research-items.json を読み取り専用で参照する
  (基本設計の確定事項: GitHub raw経由でfetchし、このリポジトリ側では一切書き込まない)。
  参照元: https://raw.githubusercontent.com/gurii-gabreh/servicenow-sub-agent/main/data/research-items.json

  このファイルはAI Labの記事データ(data/ai-articles.json)とは別物。
  ai-articles.json は自分で書く記事本体、research-items.json はネタ探し・補足情報として
  参考表示するための外部フィード、という役割分担。
*/

(function (global) {
  "use strict";

  const RESEARCH_ITEMS_URL =
    "https://raw.githubusercontent.com/gurii-gabreh/servicenow-sub-agent/main/data/research-items.json";

  const CATEGORY_LABELS = {
    1: "アプリ作成に活かせる技術",
    2: "AI技術の動向",
    3: "技術の組み合わせで新しくできること",
    4: "AIが使われる分野",
    5: "AIの流行",
    6: "世の中のニーズ・困りごと",
    7: "ハッカソン情報",
  };

  /**
   * curated(人手でキュレーション済み)の項目だけを新しい順に最大limit件取得する。
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async function fetchCuratedResearchItems(limit) {
    limit = limit || 6;
    try {
      const res = await fetch(RESEARCH_ITEMS_URL, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      return items
        .filter((item) => item.curated === true)
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
        .slice(0, limit);
    } catch (err) {
      console.warn("[AiLabResearchFeed] failed to fetch research-items.json:", err);
      return [];
    }
  }

  function categoryLabel(category) {
    return CATEGORY_LABELS[category] || "その他";
  }

  global.AiLabResearchFeed = {
    fetchCuratedResearchItems,
    categoryLabel,
    RESEARCH_ITEMS_URL,
  };
})(window);
