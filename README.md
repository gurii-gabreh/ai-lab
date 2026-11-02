# AI Lab

自作AI作品の紹介と、最新AI技術の紹介を行うブログ的な静的サイト。

将来的には広告収入・制作手順の販売・個別の有料Lessonでの収益化を構想しているが、
今回実装したのは**MVP(初期スキャフォールド)**であり、収益化機能は含まれていない。

## 構成

- GitHub Pages で配信する静的サイト(ビルドステップ無し、バニラHTML/CSS/JS)。
- ページは3種類: `index.html`(トップ)、`articles.html` / `article.html`(AI最新情報記事 一覧/詳細)、
  `portfolio.html` / `work.html`(自作AI作品紹介 一覧/詳細)。
- 共通のヘッダー・ナビゲーションは `js/common.js` に分離し、全ページから再利用している。
- コメント・いいね機能は `js/comments.js` に集約し、`submitComment(itemId, text, listEl)` /
  `toggleLike(itemId, buttonEl)` という共通関数を `article.html` / `work.html` の両方から呼び出す。
- `articles.html` では、`servicenow-sub-agent` リポジトリの `data/research-items.json`
  (キュレーション済みAI研究ネタ)を読み取り専用でfetchして「最新AI研究フィード」として表示する
  (`js/research-feed.js`)。このリポジトリ側からの書き込みは行わない。
- データはリポジトリ内JSON(`data/ai-articles.json`、`data/portfolio.json`)。MVPでは配列は空で、
  スキーマのみ確定済み。
- コメント・いいねの実データは `data/comments/<id>.json` / `data/likes/<id>.json` に
  記事・作品ごとに分割して保存する想定(今はディレクトリのみ `.gitkeep` で維持)。

## GAS Webアプリ連携(未確定・TODO)

コメント投稿・いいねは、ボタン押下の瞬間にGAS Webアプリへfetchし、GitHub API経由で
`data/comments/`・`data/likes/` 配下のJSONへ即時commitする設計。

- `gas/Code.gs`: `doPost(e)` で action(`addComment` / `toggleLike`)別に分岐するスケルトン実装。
  GitHub Contents APIの読み込み・書き込み関数のひな形も含むが、**実際のcommit処理(`writeGitHubJsonFile_`の呼び出し)はコメントアウトしたまま**にしている。GitHub Tokenの保管場所・権限、同時書き込み時の競合制御は未検討のため、有効化する前にユーザー確認が必要。
- `js/comments.js`: `GAS_WEBAPP_URL` はデプロイ前のダミー値のまま。ダミー値のままの間は
  ネットワーク呼び出しをスキップし、ローカル(楽観的)なDOM更新のみで動作する
  (Playwrightテストもこの挙動を前提にしている)。
- 実際のGAS Webアプリをデプロイし、URLが確定したら `js/comments.js` の `GAS_WEBAPP_URL` を
  書き換えるだけで本番連携が有効になる想定。

## GA4(未確定・TODO)

各HTMLの `<head>` にgtag.jsの設置用コードを入れているが、計測IDは未確定のため
ダミーID `G-XXXXXXXXXX` のままになっている。実際のGA4プロパティを作成後、全5ページの
`G-XXXXXXXXXX` を実際の計測IDに置き換える必要がある。いいね・コメント投稿時には、
`js/comments.js` 内で `gtag('event', 'like_click', ...)` / `gtag('event', 'comment_submit', ...)`
を発火する処理も実装済み。

## デザイン方針

「かっこいい、少し手の込んだAIをイメージしたトップページ」という要望に対し、
テンプレート的な見た目にならないよう、ニューラルネットワーク風のグリッド装飾・
ヴァイオレット×シアンのグラデーションアクセント・等幅フォントを混ぜた見出しで独自性を出した。
ダークモードは `prefers-color-scheme: dark` メディアクエリに対応(`css/style.css` の
`:root` にライト用トークン、`@media (prefers-color-scheme: dark)` 内にダーク用トークンを定義)。
ヘッダー・ナビゲーションは `position: sticky; top: 0;` でスクロール時も固定。
640px以下の携帯幅でもレイアウトが崩れないようレスポンシブ対応済み。

## 自動テスト

Playwright Test を導入(`tests/`)。

```bash
npm install
npx playwright install --with-deps chromium
npm test
```

検証内容:

- 各ページ(`index.html` / `articles.html` / `portfolio.html`)がJSエラー無く表示されること
- ナビゲーションリンクで各ページへ正しく移動できること
- 記事・作品が0件のときに空状態メッセージが表示されること
- いいねボタンのクリックで見た目がトグルすること
- コメント投稿フォームからの送信でDOMにコメントが追加されること
  (GASへの実際のfetchは、`GAS_WEBAPP_URL` が未確定のダミー値である間は自動的にスキップされるため、
  テスト側で追加のネットワークモックは行っていない)

CI(`.github/workflows/test.yml`)はpushごとに上記テストを自動実行する。
`.github/workflows/deploy.yml` はmainへのpushでGitHub Pagesへ自動デプロイする。

## 実装経緯(このリポジトリ自身のナレッジとして記録)

このスキャフォールドは、progress-tracker-dashboard 側で行われた新規アプリ構想・基本設計の
相談で確定した仕様(全体構成・ページ構成・データ構造・デザイン方針・テスト方針)に基づき、
2026-11-02 に初期実装した。詳細な相談経緯・判断根拠は progress-tracker-dashboard の
`data/tasks.json` / `data/concept-log.json` 側で管理されている(このリポジトリでは実装結果のみを保持)。
