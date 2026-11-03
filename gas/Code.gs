/**
 * gas/Code.gs
 *
 * AI Lab のコメント投稿・いいね・コメント編集/削除・エラーログ機能を受け取るGAS Webアプリの
 * スケルトン実装。js/common.js の postToGas() 経由で、js/comments.js の
 * submitComment()/toggleLike()/editComment()/deleteComment()/changeCommentPassword()、
 * および js/error-report.js の reportError() からのfetch(POST)を受け取る想定。
 *
 * 【2026-11-03更新】下記1・2は完了。実際のGitHubへの書き込み(writeGitHubJsonFile_の呼び出し)も
 * 全action(addComment/toggleLike/editComment/deleteComment/changePassword/logError)で有効化し、
 * 書き込み失敗時(権限不足・sha競合等)はok:falseを返すよう修正済み(isWriteSuccess_参照)。
 *
 * 完了:
 *   1. Webアプリとしてデプロイ済み。URLは js/common.js の GAS_WEBAPP_URL に設定済み。
 *   2. GitHub Personal Access Token(Fine-grained、ai-lab限定・Contents: Read and write)を
 *      Script Properties(GITHUB_TOKEN)に保存済み。
 *
 * TODO(未解決):
 *   3. 同時書き込み(複数ユーザーが同時にコメント・いいねした場合)の競合制御方法は未検討。
 *      現状はひな形のため、楽観的ロックやリトライは実装していない(sha不一致時はGitHub API自体が
 *      409を返すため、isWriteSuccess_がfalseを返しエラー扱いにはなるが、自動リトライはしない)。
 *
 * データ構造の想定(確定済み基本設計):
 *   - data/comments/<itemId>.json : { itemId, comments: [{ id, text, createdAt, passwordHash }] }
 *     (2026-11-03変更: パスワード方式の編集・削除機能追加に伴い passwordHash を追加。
 *      パスワードは平文で保存せず、必ずハッシュ化して保存する)
 *   - data/likes/<itemId>.json    : { itemId, count: number }
 *   - data/error-log.json         : [{ id, title, category, summary, resolution, status, createdAt }]
 *     (2026-11-03追加: エラーログ機能。progress-tracker-dashboard側が読み取り専用ビューアーを
 *      実装済みのため、ai-lab側はこのファイルへの書き込みのみ担当する)
 */

// ===== 設定値(TODO: Script Properties等からの取得に置き換える) =====
const GITHUB_OWNER = "gurii-gabreh"; // TODO: 確定済みだが、トークン管理方法は未確定
const GITHUB_REPO = "ai-lab";
const GITHUB_BRANCH = "main";
// TODO: GitHubへの書き込み用トークンは平文でここに書かず、
//       PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN") から取得する想定。
function getGitHubToken_() {
  return PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
}

// コメント投稿から何msで編集・削除を禁止するか(サーバー負荷軽減のため1時間、ユーザー指示で確定。
// js/comments.js の EDIT_DELETE_WINDOW_MS と同じ値。クライアント側のボタン非表示はUXのためだけの
// 制御であり、実際の制限はここ(サーバー側)で必ず検証する)。
const EDIT_DELETE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Webアプリのエントリポイント。action別に処理を振り分ける。
 * 期待するリクエストボディ(JSON):
 *   { "action": "addComment",    "itemId": "xxx", "text": "...", "commentId": "...", "password": "..." }
 *   { "action": "toggleLike",    "itemId": "xxx", "liked": true }
 *   { "action": "editComment",   "itemId": "xxx", "commentId": "...", "password": "...", "text": "..." }
 *   { "action": "deleteComment", "itemId": "xxx", "commentId": "...", "password": "..." }
 *   { "action": "changePassword","itemId": "xxx", "commentId": "...", "oldPassword": "...", "newPassword": "..." }
 *   { "action": "logError",      "title": "...", "category": "...", "summary": "..." }
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: "invalid JSON body" });
  }

  switch (body.action) {
    case "addComment":
      return handleAddComment_(body);
    case "toggleLike":
      return handleToggleLike_(body);
    case "editComment":
      return handleEditComment_(body);
    case "deleteComment":
      return handleDeleteComment_(body);
    case "changePassword":
      return handleChangePassword_(body);
    case "logError":
      return handleLogError_(body);
    default:
      return jsonResponse_({ ok: false, error: "unknown action: " + body.action });
  }
}

/**
 * コメント追加処理のひな形。
 * data/comments/<itemId>.json を読み込み、コメントを追記してGitHub APIでcommitする。
 * パスワードは平文で保存せず、ハッシュ化してpasswordHashとして保存する。
 */
function handleAddComment_(body) {
  const itemId = body.itemId;
  const text = (body.text || "").toString().trim();
  const password = (body.password || "").toString();
  if (!itemId || !text) {
    return jsonResponse_({ ok: false, error: "itemId and text are required" });
  }
  if (!password) {
    return jsonResponse_({ ok: false, error: "password_required" });
  }

  const path = "data/comments/" + itemId + ".json";
  const current = readGitHubJsonFile_(path) || { itemId: itemId, comments: [] };

  // クライアント側で生成したcommentId(楽観的UI更新のDOM要素と対応付けるため)をそのまま使う。
  // 無ければ(クライアント未送信時の後方互換として)サーバー側でUUIDを発行する。
  const commentId = (body.commentId || "").toString() || Utilities.getUuid();

  current.comments.push({
    id: commentId,
    text: text,
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword_(password),
  });

  // 2026-11-03、GitHub Token設定・確認完了により有効化。
  const writeRes = writeGitHubJsonFile_(path, current, "chore(ai-lab): add comment to " + itemId);
  if (!isWriteSuccess_(writeRes)) {
    return jsonResponse_({ ok: false, error: "github_write_failed", status: writeRes.getResponseCode() });
  }

  return jsonResponse_({ ok: true, itemId: itemId, commentId: commentId, commentCount: current.comments.length });
}

/**
 * いいねトグル処理のひな形。
 * data/likes/<itemId>.json を読み込み、カウントを増減してGitHub APIでcommitする。
 */
function handleToggleLike_(body) {
  const itemId = body.itemId;
  const liked = !!body.liked;
  if (!itemId) {
    return jsonResponse_({ ok: false, error: "itemId is required" });
  }

  const path = "data/likes/" + itemId + ".json";
  const current = readGitHubJsonFile_(path) || { itemId: itemId, count: 0 };

  current.count = Math.max(0, current.count + (liked ? 1 : -1));

  // 2026-11-03、GitHub Token設定・確認完了により有効化。
  const writeRes = writeGitHubJsonFile_(path, current, "chore(ai-lab): update like count for " + itemId);
  if (!isWriteSuccess_(writeRes)) {
    return jsonResponse_({ ok: false, error: "github_write_failed", status: writeRes.getResponseCode() });
  }

  return jsonResponse_({ ok: true, itemId: itemId, count: current.count });
}

/**
 * コメント編集処理のひな形。
 * パスワードの一致・投稿から1時間以内であることを必ずサーバー側で検証してから更新する
 * (クライアント側のチェックだけでは回避可能なため不十分、という理解に基づく確定済み要件)。
 */
function handleEditComment_(body) {
  const itemId = body.itemId;
  const commentId = body.commentId;
  const password = (body.password || "").toString();
  const newText = (body.text || "").toString().trim();
  if (!itemId || !commentId) {
    return jsonResponse_({ ok: false, error: "itemId and commentId are required" });
  }
  if (!newText) {
    return jsonResponse_({ ok: false, error: "empty" });
  }
  if (!password) {
    return jsonResponse_({ ok: false, error: "password_required" });
  }

  const path = "data/comments/" + itemId + ".json";
  const current = readGitHubJsonFile_(path);
  const comment = findComment_(current, commentId);
  if (!comment) {
    return jsonResponse_({ ok: false, error: "comment_not_found" });
  }
  if (!isWithinEditWindow_(comment.createdAt)) {
    return jsonResponse_({ ok: false, error: "edit_window_expired" });
  }
  if (comment.passwordHash !== hashPassword_(password)) {
    return jsonResponse_({ ok: false, error: "invalid_password" });
  }

  comment.text = newText;

  // 2026-11-03、GitHub Token設定・確認完了により有効化。
  const writeRes = writeGitHubJsonFile_(path, current, "chore(ai-lab): edit comment " + commentId + " on " + itemId);
  if (!isWriteSuccess_(writeRes)) {
    return jsonResponse_({ ok: false, error: "github_write_failed", status: writeRes.getResponseCode() });
  }

  return jsonResponse_({ ok: true, itemId: itemId, commentId: commentId });
}

/**
 * コメント削除処理のひな形。
 * パスワードの一致・投稿から1時間以内であることを必ずサーバー側で検証してから削除する。
 */
function handleDeleteComment_(body) {
  const itemId = body.itemId;
  const commentId = body.commentId;
  const password = (body.password || "").toString();
  if (!itemId || !commentId) {
    return jsonResponse_({ ok: false, error: "itemId and commentId are required" });
  }
  if (!password) {
    return jsonResponse_({ ok: false, error: "password_required" });
  }

  const path = "data/comments/" + itemId + ".json";
  const current = readGitHubJsonFile_(path);
  const comment = findComment_(current, commentId);
  if (!comment) {
    return jsonResponse_({ ok: false, error: "comment_not_found" });
  }
  if (!isWithinEditWindow_(comment.createdAt)) {
    return jsonResponse_({ ok: false, error: "edit_window_expired" });
  }
  if (comment.passwordHash !== hashPassword_(password)) {
    return jsonResponse_({ ok: false, error: "invalid_password" });
  }

  current.comments = current.comments.filter(function (c) {
    return c.id !== commentId;
  });

  // 2026-11-03、GitHub Token設定・確認完了により有効化。
  const writeRes = writeGitHubJsonFile_(path, current, "chore(ai-lab): delete comment " + commentId + " on " + itemId);
  if (!isWriteSuccess_(writeRes)) {
    return jsonResponse_({ ok: false, error: "github_write_failed", status: writeRes.getResponseCode() });
  }

  return jsonResponse_({ ok: true, itemId: itemId, commentId: commentId });
}

/**
 * パスワード変更処理のひな形。
 *
 * 判断理由(要件に明記されていなかったため追加した判断、2026-11-03):
 * ユーザーがパスワードを好きな文字列に変更できるUIを実用的に機能させるには、
 * localStorageだけでなくサーバー側のpasswordHashも更新する必要がある。更新しないと、
 * 変更後は「localStorageの新パスワード」と「サーバーに保存されたハッシュ(旧パスワード)」が
 * 食い違い、以後の編集・削除が常に失敗する不具合になるため、本人確認(oldPasswordの一致)を
 * 行った上でサーバー側のハッシュも更新するactionとして追加した。
 */
function handleChangePassword_(body) {
  const itemId = body.itemId;
  const commentId = body.commentId;
  const oldPassword = (body.oldPassword || "").toString();
  const newPassword = (body.newPassword || "").toString();
  if (!itemId || !commentId) {
    return jsonResponse_({ ok: false, error: "itemId and commentId are required" });
  }
  if (!oldPassword || !newPassword) {
    return jsonResponse_({ ok: false, error: "password_required" });
  }

  const path = "data/comments/" + itemId + ".json";
  const current = readGitHubJsonFile_(path);
  const comment = findComment_(current, commentId);
  if (!comment) {
    return jsonResponse_({ ok: false, error: "comment_not_found" });
  }
  if (comment.passwordHash !== hashPassword_(oldPassword)) {
    return jsonResponse_({ ok: false, error: "invalid_password" });
  }

  comment.passwordHash = hashPassword_(newPassword);

  // 2026-11-03、GitHub Token設定・確認完了により有効化。
  const writeRes = writeGitHubJsonFile_(path, current, "chore(ai-lab): change comment password for " + commentId + " on " + itemId);
  if (!isWriteSuccess_(writeRes)) {
    return jsonResponse_({ ok: false, error: "github_write_failed", status: writeRes.getResponseCode() });
  }

  return jsonResponse_({ ok: true, itemId: itemId, commentId: commentId });
}

/**
 * エラーログ記録処理のひな形。
 * ai-labリポジトリ自身の data/error-log.json へ追記する。
 * progress-tracker-dashboard側に読み取り専用ビューアーが実装済みのため、ai-lab側はこの
 * スキーマ({ id, title, category, summary, resolution, status, createdAt })を守って
 * 書き込むことだけに専念する。
 */
function handleLogError_(body) {
  const title = (body.title || "unknown error").toString();
  const category = (body.category || "uncategorized").toString();
  const summary = (body.summary || "").toString();

  const path = "data/error-log.json";
  const current = readGitHubJsonFile_(path) || [];

  current.push({
    id: Utilities.getUuid(),
    title: title,
    category: category,
    summary: summary,
    resolution: "",
    status: "未対応",
    createdAt: new Date().toISOString(),
  });

  // 2026-11-03、GitHub Token設定・確認完了により有効化。
  const writeRes = writeGitHubJsonFile_(path, current, "chore(ai-lab): log error - " + title);
  if (!isWriteSuccess_(writeRes)) {
    return jsonResponse_({ ok: false, error: "github_write_failed", status: writeRes.getResponseCode() });
  }

  return jsonResponse_({ ok: true, logCount: current.length });
}

/**
 * data/comments/<itemId>.json の中から、指定したcommentIdのコメントを探す。
 * 見つからない場合(ファイル自体が無い場合も含む)はnullを返す。
 */
function findComment_(commentsFile, commentId) {
  if (!commentsFile || !Array.isArray(commentsFile.comments)) return null;
  for (let i = 0; i < commentsFile.comments.length; i++) {
    if (commentsFile.comments[i].id === commentId) return commentsFile.comments[i];
  }
  return null;
}

/**
 * コメント投稿から EDIT_DELETE_WINDOW_MS (1時間)以内かどうかを判定する。
 */
function isWithinEditWindow_(createdAtISOString) {
  const createdAt = new Date(createdAtISOString).getTime();
  if (isNaN(createdAt)) return false;
  return Date.now() - createdAt <= EDIT_DELETE_WINDOW_MS;
}

/**
 * パスワードをハッシュ化する(SHA-256、16進文字列化)。
 * GASの標準ライブラリ Utilities.computeDigest を使用する(追加のライブラリ導入が不要なため標準的)。
 */
function hashPassword_(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return digest
    .map(function (byte) {
      const v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");
}

/**
 * GitHub Contents APIからJSONファイルを読み込む。存在しない場合はnullを返す。
 */
function readGitHubJsonFile_(path) {
  const token = getGitHubToken_();
  const url =
    "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/contents/" + path +
    "?ref=" + GITHUB_BRANCH;

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "token " + token },
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    return null; // ファイルが存在しない、または未作成
  }

  const json = JSON.parse(res.getContentText());
  const content = Utilities.newBlob(Utilities.base64Decode(json.content)).getDataAsString();
  return JSON.parse(content);
}

/**
 * GitHub Contents APIでJSONファイルを更新(新規作成 or 上書き)する。
 * TODO: 実際に有効化する前に、同時更新時のsha競合リトライを検討する。
 */
function writeGitHubJsonFile_(path, data, message) {
  const token = getGitHubToken_();
  const baseUrl =
    "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/contents/" + path;

  // 既存ファイルのshaを取得(新規作成時は取得できないためnullのままでよい)
  let sha = null;
  const getRes = UrlFetchApp.fetch(baseUrl + "?ref=" + GITHUB_BRANCH, {
    method: "get",
    headers: { Authorization: "token " + token },
    muteHttpExceptions: true,
  });
  if (getRes.getResponseCode() === 200) {
    sha = JSON.parse(getRes.getContentText()).sha;
  }

  const payload = {
    message: message,
    content: Utilities.base64Encode(JSON.stringify(data, null, 2)),
    branch: GITHUB_BRANCH,
  };
  if (sha) payload.sha = sha;

  return UrlFetchApp.fetch(baseUrl, {
    method: "put",
    contentType: "application/json",
    headers: { Authorization: "token " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

/**
 * writeGitHubJsonFile_の戻り値(HTTPResponse)が成功(200/201)かどうかを判定する。
 * 2026-11-03追加: 従来は書き込み結果を確認せず常にok:trueを返していたが、GitHub API呼び出しが
 * 失敗した場合(トークン権限不足・sha競合等)に「保存した」と偽って返してしまう問題があったため、
 * 必ずレスポンスコードを確認してから成功/失敗を判定するようにした。
 */
function isWriteSuccess_(httpResponse) {
  const code = httpResponse.getResponseCode();
  return code === 200 || code === 201;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
