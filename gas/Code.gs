/**
 * gas/Code.gs
 *
 * AI Lab のコメント投稿・いいね機能を受け取るGAS Webアプリのスケルトン実装。
 * js/comments.js の submitComment() / toggleLike() からのfetch(POST)を受け取る想定。
 *
 * TODO(未確定事項、実装前にユーザーへ確認が必要):
 *   1. このスクリプトをWebアプリとしてデプロイし、発行されたURLを js/comments.js の
 *      GAS_WEBAPP_URL に設定する。
 *   2. GitHub API 経由でこのリポジトリ(ai-lab)の data/comments/<id>.json・
 *      data/likes/<id>.json を更新するために、GitHubのPersonal Access Token(またはApp)
 *      をどこに安全に保管するか(Script Properties想定)をユーザーと確認する。
 *   3. 同時書き込み(複数ユーザーが同時にコメント・いいねした場合)の競合制御方法は未検討。
 *      現状はひな形のため、楽観的ロックやリトライは実装していない。
 *
 * データ構造の想定(確定済み基本設計):
 *   - data/comments/<itemId>.json : { itemId, comments: [{ id, text, createdAt }] }
 *   - data/likes/<itemId>.json    : { itemId, count: number }
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

/**
 * Webアプリのエントリポイント。action別に処理を振り分ける。
 * 期待するリクエストボディ(JSON):
 *   { "action": "addComment", "itemId": "xxx", "text": "..." }
 *   { "action": "toggleLike",  "itemId": "xxx", "liked": true }
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
    default:
      return jsonResponse_({ ok: false, error: "unknown action: " + body.action });
  }
}

/**
 * コメント追加処理のひな形。
 * data/comments/<itemId>.json を読み込み、コメントを追記してGitHub APIでcommitする。
 */
function handleAddComment_(body) {
  const itemId = body.itemId;
  const text = (body.text || "").toString().trim();
  if (!itemId || !text) {
    return jsonResponse_({ ok: false, error: "itemId and text are required" });
  }

  const path = "data/comments/" + itemId + ".json";
  const current = readGitHubJsonFile_(path) || { itemId: itemId, comments: [] };

  current.comments.push({
    id: Utilities.getUuid(),
    text: text,
    createdAt: new Date().toISOString(),
  });

  // TODO: 実際のcommit処理を有効化する前に、GitHub Tokenの権限・運用方法をユーザーと確認すること。
  // writeGitHubJsonFile_(path, current, "chore(ai-lab): add comment to " + itemId);

  return jsonResponse_({ ok: true, itemId: itemId, commentCount: current.comments.length });
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

  // TODO: 実際のcommit処理を有効化する前に、GitHub Tokenの権限・運用方法をユーザーと確認すること。
  // writeGitHubJsonFile_(path, current, "chore(ai-lab): update like count for " + itemId);

  return jsonResponse_({ ok: true, itemId: itemId, count: current.count });
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

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
