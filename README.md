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

コメント投稿・いいね・コメント編集/削除・エラーログは、ボタン押下やエラー発生の瞬間にGAS Webアプリへ
fetchし、GitHub API経由で `data/comments/`・`data/likes/`・`data/error-log.json` へ即時commitする設計。

- `gas/Code.gs`: `doPost(e)` で action(`addComment` / `toggleLike` / `editComment` /
  `deleteComment` / `changePassword` / `logError`)別に分岐するスケルトン実装。
  GitHub Contents APIの読み込み・書き込み関数のひな形も含むが、**実際のcommit処理(`writeGitHubJsonFile_`の呼び出し)はコメントアウトしたまま**にしている。GitHub Tokenの保管場所・権限、同時書き込み時の競合制御は未検討のため、有効化する前にユーザー確認が必要。
- `js/common.js`: `GAS_WEBAPP_URL` はデプロイ前のダミー値のまま。ダミー値のままの間は
  ネットワーク呼び出しをスキップし、ローカル(楽観的)なDOM更新のみで動作する
  (Playwrightテストもこの挙動を前提にしている)。
  (2026-11-03変更: 元は `js/comments.js` にあったが、コメント機能を持たない一覧ページからも
  エラーログ(`logError`)を送信する必要が出たため、全ページ共通の `js/common.js` へ移設した)
- 実際のGAS Webアプリをデプロイし、URLが確定したら `js/common.js` の `GAS_WEBAPP_URL` を
  書き換えるだけで本番連携が有効になる想定。

### パスワード方式のコメント編集・削除(2026-11-03実装)

- コメント投稿成功直後、ランダム生成した6桁の編集・削除用パスワードを画面に表示し
  (`js/comments.js` の `generatePassword()`)、ユーザーが好きな文字列に変更できるUIも併設する。
- パスワードはlocalStorage(`aiLabCommentPasswords`キー)にも保存し、同じ端末・同じブラウザなら
  次回以降の編集・削除フォームに自動入力される(別端末・別ブラウザでは手動入力が必要)。
- 投稿から1時間を超えると編集・削除ボタンを非表示にする(サーバー負荷軽減のため、ユーザー指示で確定)。
  ページを開いたままでも反映されるよう30秒おきに再チェックしている。
- パスワードの正当性はサーバー側(GAS)でも必ず検証する。`gas/Code.gs` の `handleEditComment_` /
  `handleDeleteComment_` が `Utilities.computeDigest`(SHA-256)でハッシュ化した値を比較する想定。
  パスワードは平文で保存せず、`data/comments/<itemId>.json` には `passwordHash` のみを保存する。
- **判断理由を明記(要件に無かったため、実装時に追加判断した点)**: パスワード変更UIを実用的に
  機能させるには、localStorageだけでなくサーバー側の `passwordHash` も更新する必要があるため、
  `changePassword` という新しいaction(`handleChangePassword_`)を追加した。追加しない場合、
  変更後は「localStorageの新パスワード」と「サーバー保存済みハッシュ(旧パスワード)」が食い違い、
  以後の編集・削除が常に失敗してしまうため。本人確認として変更前のパスワード(`oldPassword`)の
  一致も必須にしている。

## エラーログ機能(2026-11-03実装)

JSのエラー・例外発生時、コンソール出力に加えてGASの `logError` action(`js/error-report.js` の
`reportError(title, category, summary)`)へ送信し、`gas/Code.gs` の `handleLogError_` が
このai-labリポジトリ自身の `data/error-log.json`(スキーマ: `[{ id, title, category, summary,
resolution, status, createdAt }]`、`resolution`/`status`の初期値はそれぞれ空文字/"未対応")へ
追記する想定。progress-tracker-dashboard側がこのファイルをraw.githubusercontent.com経由で
読み取り表示するビューアーを実装済みのため、ai-lab側はこのファイルへの書き込みのみに専念する。

`js/common.js` の `loadJSON`・`js/research-feed.js` の `fetchCuratedResearchItems`・
`js/common.js` の `postToGas`(comments.jsの全action共通経路)の各catchブロックから呼び出している。
`GAS_WEBAPP_URL` が未確定の間は、既存のaddComment/toggleLike等と同様にネットワーク呼び出し自体を
スキップし、コンソール出力のみで済ませる(画面を壊さないフェイルセーフの挙動は維持)。
`logError`自身の送信が失敗した場合に再度`reportError`を呼ぶと無限ループになるため、
`postToGas`側で `action !== "logError"` のときのみエラーを記録するガードを入れている。

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
- コメント投稿直後に編集・削除用パスワードが表示されること、好きな文字列に変更できること
- 正しいパスワードでコメントの編集・削除ができること(成功パターン)
- パスワード未入力のまま編集・削除しようとすると失敗し、コメントが変更されないこと(失敗パターン)
- 投稿から1時間を超えると編集・削除ボタンが非表示になること(Playwrightの`page.clock`で時刻を進めて検証)

CI(`.github/workflows/test.yml`)はpushごとに上記テストを自動実行する。
`.github/workflows/deploy.yml` はmainへのpushでGitHub Pagesへ自動デプロイする。

## 実装経緯(このリポジトリ自身のナレッジとして記録)

このスキャフォールドは、progress-tracker-dashboard 側で行われた新規アプリ構想・基本設計の
相談で確定した仕様(全体構成・ページ構成・データ構造・デザイン方針・テスト方針)に基づき、
2026-11-02 に初期実装した。詳細な相談経緯・判断根拠は progress-tracker-dashboard の
`data/tasks.json` / `data/concept-log.json` 側で管理されている(このリポジトリでは実装結果のみを保持)。

2026-11-03には、progress-tracker-dashboardでの④詳細設計相談で確定した「パスワード方式のコメント
編集・削除」「エラーログ機能」の2点を追加実装した。GAS連携の共通処理(`GAS_WEBAPP_URL`・
`postToGas`)を`js/comments.js`から`js/common.js`へ移設した点、およびパスワード変更時に
サーバー側`passwordHash`も更新する`changePassword`actionを追加した点は、要件に明記されていなかった
ため実装時にこのリポジトリ側で判断した内容(判断理由は上記の各セクションに記載)。
