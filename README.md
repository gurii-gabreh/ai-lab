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
ヘッダー・ナビゲーションは `position: sticky; top: 0;` でスクロール時も固定。
640px以下の携帯幅でもレイアウトが崩れないようレスポンシブ対応済み(760px案もあったが、
このリポジトリでは640pxに統一する方針で確定済み)。

### 配色・フォント・スペーシングの更新(2026-11-03、デザイン設計相談で確定)

progress-tracker-dashboardでのデザイン設計相談で、manager-room側が作成したトップページの
モックアップ(Claude Design、`https://claude.ai/artifact/2ktTwDujNahY5CWo4jYePY` の
`project/Main.dc.html`)を踏まえ、以下の変更を実装した。

- **ダーク固定化**: 以前は `css/style.css` の `:root`(ライト用)と
  `@media (prefers-color-scheme: dark)` 内の `:root`(ダーク用)の2系統でOS設定に応じて
  切り替えていたが、モックアップで確定した配色はダーク固定の1系統のみだったため、
  ライト用トークンを廃止し、ダーク用だった値(今回更新した新しい値)を `:root` に直接
  定義する方式に統一した。OS側がライトモード設定でも、このサイトは常にダーク配色で表示される。
  全5ページ(index/articles/article/portfolio/work)は共通の`css/style.css`を読み込む構成のため、
  この変更だけで全ページに反映される。
- **配色トークン更新**: 背景 `#0A0A10`、文字 `#F2F2F5`、アクセント1(紫)`#7C8CFF`、
  アクセント2(シアン)`#22D3EE` に更新。アクセント1はモックアップで`#7C8CFF`と`#8B5CF6`の
  2候補が示されたが、アクセント2のシアンとの明度バランスが取りやすい`#7C8CFF`を採用した
  (`#8B5CF6`は彩度が高く、沈んだ背景色上でやや重く見えたため見送り)。
- **フォント**: 見出しフォントは `Space Grotesk` のまま変更なし。本文フォントは、以前は
  `body`全体が見出しと同じ `--font-display` を使っており本文専用の変数が存在しなかったが、
  モックアップで本文に`Inter`の指定があったため、新たに`--font-body`トークンを追加して
  `body`(地の文)に適用した。見出し要素(`h1`〜`h6`)には明示的に`--font-display`を指定し、
  従来通り`Space Grotesk`を維持している(見出し/本文でフォントを分けるのがモックアップの
  意図であり、既存の「見出しにディスプレイ/等幅フォントを使ってAI感を出す」方針とも
  矛盾しないため)。なお、このリポジトリはこれまで`Space Grotesk`/`JetBrains Mono`を含め
  Google Fonts等の実フォントを一度も読み込んでおらず(`<link>`/`@font-face`が存在しない)、
  指定フォントはブラウザのフォールバック機能によりシステムフォントで表示されている。
  これは今回の配色変更より前から存在する既存の未対応事項であり、フォント読み込みの追加は
  今回の依頼(配色・ダーク固定・スペーシング・フォーカス表示)の範囲外と判断し、今回は
  `--font-body`トークンの追加のみに留めた(フォント読み込み自体の対応が必要なら別途相談)。
- **スペーシング変数化**: `--space-xs`(0.4rem)〜`--space-xl`(4rem)の5段階を`:root`に追加し、
  ヘッダー・ナビ・`page-shell`・カード・プロフィールカード・リサーチフィード・フッター等、
  主要なレイアウト部分のpadding/gapを変数に置き換えた。既存の見た目を変えないことを優先し、
  既存の実測値に近い値を採用(厳密な等比数列ではない)。細部(ボタン・コメント関連UI等)の
  微小なpadding値は、依頼内容の「主要なレイアウト部分を優先」に沿って今回は対象外とした。
- **フォーカス表示**: `a` / `button` / `input` / `textarea` / `[tabindex]`に対し、
  `:focus-visible`擬似クラスでアクセントカラー(シアン)のフォーカスリングを追加した。
  `:focus`ではなく`:focus-visible`を使うことで、マウスクリック時には表示されず、
  キーボード操作(Tab移動)時のみ表示される(マウス操作時に常時枠が出る見た目の変化を避けるため)。

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
