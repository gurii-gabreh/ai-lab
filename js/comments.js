/*
  js/comments.js
  コメント・いいね機能の共通モジュール。article.html / work.html の両方の詳細ページから
  同じ関数(submitComment / toggleLike / editComment / deleteComment)で呼び出せるようにする。

  GAS Webアプリ連携について(TODO):
  - GASのWebアプリURLはまだデプロイ・確定していないため、GAS_WEBAPP_URL(js/common.js側)は
    ダミー値のままにしている。
  - 実際のURLが確定したら、js/common.js の GAS_WEBAPP_URL を書き換えるだけで本番連携が有効になる想定。
  - URLがダミーのままの間は、ネットワーク呼び出しを行わず「ローカル(楽観的)更新のみ」で動作する。
    これにより、Playwright等の自動テストもネットワーク・GAS側の実装を待たずに
    「クリックで見た目が変わる」「送信でDOMに追加される」という挙動を検証できる。
  - 対応するGASスケルトンは gas/Code.gs を参照(doPost(e) で action 別に分岐する想定)。
  - GAS_WEBAPP_URL/postToGas 自体は js/common.js に定義されている(2026-11-03、エラーログ機能追加時に
    comments.jsから移設。経緯はjs/common.jsのコメント参照)。

  パスワード方式のコメント編集・削除について(2026-11-03追加):
  - コメント投稿時にランダムな編集・削除用パスワードを自動生成し、localStorageに保存する。
    同じ端末・同じブラウザなら次回以降は編集・削除フォームに自動入力される(別端末では手動入力が必要)。
  - 投稿から1時間を超えたら編集・削除ボタンを非表示にする(サーバー負荷軽減のため、確定済み要件)。
  - パスワードの正当性は、クライアント側では「入力されているか」程度の軽いチェックのみ行い、
    実際の一致検証は必ずサーバー側(GAS、gas/Code.gs の各ハンドラ)で行う設計とする。
    クライアント側だけのチェックは回避可能(DevToolsで直接関数を呼べる等)なため不十分、という
    理解に基づく(確定済み要件)。
*/

(function (global) {
  "use strict";

  const AiLabCommonRef = global.AiLabCommon || {};
  const postToGas = AiLabCommonRef.postToGas;
  const isGasUrlConfigured = AiLabCommonRef.isGasUrlConfigured;

  // 投稿から何msで編集・削除ボタンを非表示にするか(サーバー負荷軽減のため1時間、ユーザー指示で確定)
  const EDIT_DELETE_WINDOW_MS = 60 * 60 * 1000;
  // 編集・削除ボタンの表示/非表示を定期的に再チェックする間隔(ページを開いたままでも1時間経過したら
  // 自動的に非表示にするため。テストではPlaywrightのpage.clockでタイマーを進めて検証する)
  const VISIBILITY_RECHECK_INTERVAL_MS = 30 * 1000;

  const PASSWORD_STORAGE_KEY = "aiLabCommentPasswords";
  // パスワードの誤読を防ぐため、見分けにくい文字(0/O、1/l/I等)を除いた文字集合から生成する
  const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

  function fireGtagEvent(eventName, params) {
    if (typeof global.gtag === "function") {
      global.gtag("event", eventName, params || {});
    } else {
      console.info("[AiLabComments] gtag not loaded, skip event:", eventName, params);
    }
  }

  // ===== パスワード生成・localStorage管理 =====

  /**
   * 6桁の英数字パスワードをランダム生成する。
   */
  function generatePassword(length) {
    length = length || 6;
    let pw = "";
    for (let i = 0; i < length; i++) {
      pw += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
    }
    return pw;
  }

  function loadPasswordStore_() {
    try {
      const raw = window.localStorage.getItem(PASSWORD_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn("[AiLabComments] localStorage read failed:", err);
      return {};
    }
  }

  function storeKey_(itemId, commentId) {
    return itemId + "::" + commentId;
  }

  /**
   * コメントの編集・削除用パスワードをlocalStorageへ保存する。
   * 同じ端末・同じブラウザなら、次回以降このコメントの編集・削除フォームに自動入力される。
   * @param {{itemId: string, commentId: string, password: string}} record
   */
  function savePasswordLocally(record) {
    const itemId = record && record.itemId;
    const commentId = record && record.commentId;
    const password = record && record.password;
    if (!itemId || !commentId || !password) return;

    try {
      const store = loadPasswordStore_();
      store[storeKey_(itemId, commentId)] = password;
      window.localStorage.setItem(PASSWORD_STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
      console.warn("[AiLabComments] localStorage write failed:", err);
    }
  }

  /**
   * 保存済みのパスワードを取得する(無ければ空文字)。
   */
  function getLocalPassword(itemId, commentId) {
    const store = loadPasswordStore_();
    return store[storeKey_(itemId, commentId)] || "";
  }

  // ===== GAS呼び出し本体(addComment / toggleLike / editComment / deleteComment / changePassword) =====

  /**
   * コメントを投稿する。
   * @param {string} itemId - 記事ID or 作品ID
   * @param {string} text - コメント本文
   * @param {HTMLElement} [listEl] - 追記先のコメント一覧要素(渡されればDOMへ楽観的に追加)
   * @returns {Promise<{ok: boolean, commentId?: string, password?: string}>}
   */
  async function submitComment(itemId, text, listEl) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
      return { ok: false, error: "empty" };
    }

    const commentId = "local-" + Date.now();
    const password = generatePassword();
    const commentRecord = {
      id: commentId,
      itemId: itemId,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    // 同じ端末・同じブラウザなら次回以降の編集・削除フォームに自動入力されるよう、先に保存しておく
    savePasswordLocally({ itemId: itemId, commentId: commentId, password: password });

    // 楽観的UI更新: GASの応答を待たずに即座にDOMへ反映する
    if (listEl) {
      const el = renderCommentItem_(commentRecord);
      listEl.prepend(el);
      // 投稿直後だけ、自動生成したパスワードの表示・変更UIを出す(確定済み要件)
      showPasswordNotice_(el, itemId, commentId, password);
    }

    fireGtagEvent("comment_submit", { item_id: itemId, char_count: trimmed.length });

    // パスワードはGAS側でハッシュ化して保存する想定のため、ここでは平文のまま送る(HTTPS前提)。
    // クライアント側ではハッシュ化しない(ハッシュ方式が変わってもクライアントの修正が不要になるため)。
    const result = await postToGas("addComment", {
      itemId: itemId,
      text: trimmed,
      commentId: commentId,
      password: password,
    });
    return Object.assign({ commentId: commentId, password: password }, result);
  }

  /**
   * コメントを編集する。
   * @param {string} itemId
   * @param {string} commentId
   * @param {string} password - 編集・削除用パスワード(平文、サーバー側でハッシュ比較する)
   * @param {string} newText
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async function editComment(itemId, commentId, password, newText) {
    const trimmedPassword = (password || "").trim();
    const trimmedText = (newText || "").trim();

    // クライアント側では「入力されているか」程度の軽いチェックのみ行う(submitComment の
    // 空文字チェックと同じレベル)。実際のパスワード一致検証は必ずGAS側で行う。
    if (!trimmedPassword) {
      return { ok: false, error: "password_required" };
    }
    if (!trimmedText) {
      return { ok: false, error: "empty" };
    }

    const result = await postToGas("editComment", {
      itemId: itemId,
      commentId: commentId,
      password: trimmedPassword,
      text: trimmedText,
    });
    return result;
  }

  /**
   * コメントを削除する。
   * @param {string} itemId
   * @param {string} commentId
   * @param {string} password - 編集・削除用パスワード(平文、サーバー側でハッシュ比較する)
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async function deleteComment(itemId, commentId, password) {
    const trimmedPassword = (password || "").trim();
    if (!trimmedPassword) {
      return { ok: false, error: "password_required" };
    }

    const result = await postToGas("deleteComment", {
      itemId: itemId,
      commentId: commentId,
      password: trimmedPassword,
    });
    return result;
  }

  /**
   * 編集・削除用パスワードを、ユーザーが指定した文字列へ変更する。
   * GAS側のpasswordHashも更新する必要があるため(そうしないと、別端末はもちろん同端末でも
   * 次回以降「localStorageの新パスワード」と「サーバーに保存されたハッシュ」が食い違い、
   * 以後の編集・削除が常に失敗してしまう)、changePassword actionとしてGASへ送信する。
   * ※ この changePassword action は要件に明記されていなかったが、パスワード変更UIを
   *   実用的に機能させるために必要と判断して追加した(判断理由としてREADME/コミットメッセージに記載)。
   * @param {string} itemId
   * @param {string} commentId
   * @param {string} oldPassword - 変更前のパスワード(本人確認のため必須)
   * @param {string} newPassword - 変更後のパスワード
   */
  async function changeCommentPassword(itemId, commentId, oldPassword, newPassword) {
    const trimmedOld = (oldPassword || "").trim();
    const trimmedNew = (newPassword || "").trim();
    if (!trimmedOld || !trimmedNew) {
      return { ok: false, error: "password_required" };
    }

    const result = await postToGas("changePassword", {
      itemId: itemId,
      commentId: commentId,
      oldPassword: trimmedOld,
      newPassword: trimmedNew,
    });

    if (result && result.ok) {
      savePasswordLocally({ itemId: itemId, commentId: commentId, password: trimmedNew });
    }
    return result;
  }

  /**
   * いいねをトグルする。
   * @param {string} itemId - 記事ID or 作品ID
   * @param {HTMLElement} [buttonEl] - いいねボタン要素(渡されれば見た目をトグル)
   * @returns {Promise<{ok: boolean, liked: boolean}>}
   */
  async function toggleLike(itemId, buttonEl) {
    let liked = false;
    let count = null;

    if (buttonEl) {
      const current = buttonEl.getAttribute("data-liked") === "true";
      liked = !current;
      buttonEl.setAttribute("data-liked", String(liked));
      buttonEl.setAttribute("aria-pressed", String(liked));

      const countEl = buttonEl.querySelector("[data-like-count]");
      if (countEl) {
        const currentCount = parseInt(countEl.textContent, 10) || 0;
        count = liked ? currentCount + 1 : Math.max(0, currentCount - 1);
        countEl.textContent = String(count);
      }

      const labelEl = buttonEl.querySelector("[data-like-label]");
      if (labelEl) {
        labelEl.textContent = liked ? "Liked" : "Like";
      }
    }

    fireGtagEvent("like_click", { item_id: itemId, liked: liked });

    const result = await postToGas("toggleLike", { itemId: itemId, liked: liked });
    return Object.assign({ liked: liked, count: count }, result);
  }

  // ===== コメント1件分のDOM構築・編集/削除UIの配線 =====

  function isWithinEditWindow_(createdAtISOString) {
    const createdAt = new Date(createdAtISOString).getTime();
    if (Number.isNaN(createdAt)) return false;
    return Date.now() - createdAt <= EDIT_DELETE_WINDOW_MS;
  }

  /**
   * コメント1件分の要素を組み立てる。編集・削除ボタン・パスワード入力フォームの表示領域も
   * 合わせて用意し、投稿から1時間を超えたら編集・削除ボタンを非表示にする定期チェックを開始する。
   */
  function renderCommentItem_(record) {
    const common = global.AiLabCommon;
    const metaText = common ? common.formatDate(record.createdAt) : record.createdAt;
    const bodyText = common ? common.escapeHTML(record.text) : record.text;

    const el = document.createElement("div");
    el.className = "comment-item";
    el.setAttribute("data-comment-id", record.id);
    el.setAttribute("data-created-at", record.createdAt);
    el.innerHTML = `
      <div class="comment-item__meta">${metaText}</div>
      <div class="comment-item__body" data-comment-body>${bodyText}</div>
      <div class="comment-item__actions" data-comment-actions></div>
      <div class="comment-item__password-notice" data-password-notice></div>
      <div class="comment-item__action-form" data-action-form></div>
    `;

    updateActionButtons_(el, record.itemId, record.id);

    // ページを開いたままでも1時間経過したらボタンを非表示にするため、定期的に再チェックする。
    // コメントがDOMから取り除かれた(削除された)後はタイマーを止める。
    const intervalId = global.setInterval(() => {
      if (!document.body.contains(el)) {
        global.clearInterval(intervalId);
        return;
      }
      updateActionButtons_(el, record.itemId, record.id);
    }, VISIBILITY_RECHECK_INTERVAL_MS);

    return el;
  }

  /**
   * 投稿から1時間以内なら編集・削除ボタンを表示し、クリックでパスワード入力フォームを開けるようにする。
   * 1時間を超えていたら非表示にする(サーバー負荷軽減のため、ユーザー指示で確定)。
   */
  function updateActionButtons_(el, itemId, commentId) {
    const actionsEl = el.querySelector("[data-comment-actions]");
    if (!actionsEl) return;

    const createdAt = el.getAttribute("data-created-at");
    if (!isWithinEditWindow_(createdAt)) {
      if (actionsEl.innerHTML !== "") actionsEl.innerHTML = "";
      return;
    }
    if (actionsEl.querySelector('[data-action="edit"]')) return; // 既に表示済みなら再構築しない

    actionsEl.innerHTML = `
      <button type="button" class="btn btn--small" data-action="edit">編集</button>
      <button type="button" class="btn btn--small btn--danger" data-action="delete">削除</button>
    `;

    const editBtn = actionsEl.querySelector('[data-action="edit"]');
    const deleteBtn = actionsEl.querySelector('[data-action="delete"]');
    if (editBtn) {
      editBtn.addEventListener("click", () => showActionForm_(el, itemId, commentId, "edit"));
    }
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => showActionForm_(el, itemId, commentId, "delete"));
    }
  }

  /**
   * 編集・削除それぞれについて、「このパスワードが必要です」メッセージとパスワード入力欄を
   * 表示する(確定済み要件)。同じ端末に保存済みのパスワードがあれば自動入力する。
   */
  function showActionForm_(el, itemId, commentId, mode) {
    const formMount = el.querySelector("[data-action-form]");
    if (!formMount) return;

    const bodyEl = el.querySelector("[data-comment-body]");
    const currentText = bodyEl ? bodyEl.textContent : "";
    const common = global.AiLabCommon;
    const escapedCurrentText = common ? common.escapeHTML(currentText) : currentText;
    const storedPassword = getLocalPassword(itemId, commentId);

    formMount.innerHTML = `
      <div class="comment-item__action-form-inner">
        <p class="comment-item__password-required">このパスワードが必要です</p>
        <input type="password" class="comment-item__password-input" data-password-input placeholder="パスワード" />
        ${mode === "edit" ? `<textarea class="comment-item__edit-text" data-edit-text>${escapedCurrentText}</textarea>` : `<p class="comment-item__delete-confirm">本当に削除しますか?この操作は取り消せません。</p>`}
        <div class="comment-item__form-actions">
          <button type="button" class="btn btn--primary btn--small" data-confirm>${mode === "edit" ? "更新する" : "削除する"}</button>
          <button type="button" class="btn btn--ghost btn--small" data-cancel>キャンセル</button>
        </div>
        <p class="comment-item__form-error" data-form-error hidden></p>
      </div>
    `;

    const passwordInput = formMount.querySelector("[data-password-input]");
    if (passwordInput) passwordInput.value = storedPassword;

    const cancelBtn = formMount.querySelector("[data-cancel]");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        formMount.innerHTML = "";
      });
    }

    const confirmBtn = formMount.querySelector("[data-confirm]");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        const password = passwordInput ? passwordInput.value : "";
        const errorEl = formMount.querySelector("[data-form-error]");

        if (mode === "edit") {
          const editTextEl = formMount.querySelector("[data-edit-text]");
          const newText = editTextEl ? editTextEl.value : "";
          const result = await editComment(itemId, commentId, password, newText);
          if (result && result.ok) {
            if (bodyEl) bodyEl.textContent = (newText || "").trim();
            fireGtagEvent("comment_edit", { item_id: itemId, comment_id: commentId });
            formMount.innerHTML = "";
          } else {
            showFormError_(errorEl, result && result.error);
          }
        } else {
          const result = await deleteComment(itemId, commentId, password);
          if (result && result.ok) {
            fireGtagEvent("comment_delete", { item_id: itemId, comment_id: commentId });
            el.remove();
          } else {
            showFormError_(errorEl, result && result.error);
          }
        }
      });
    }
  }

  function showFormError_(errorEl, errorCode) {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent =
      errorCode === "password_required"
        ? "パスワードを入力してください。"
        : errorCode === "invalid_password"
        ? "パスワードが正しくありません。"
        : errorCode === "edit_window_expired"
        ? "投稿から1時間を超えたため、編集・削除できません。"
        : "処理に失敗しました。もう一度お試しください。";
  }

  /**
   * コメント投稿直後に、自動生成したパスワードの表示・変更UIを出す(確定済み要件)。
   * ユーザーは好きな文字列に変更できる(変更後はlocalStorageとGAS側のpasswordHashを両方更新する)。
   */
  function showPasswordNotice_(el, itemId, commentId, password) {
    const noticeEl = el.querySelector("[data-password-notice]");
    if (!noticeEl) return;
    renderPasswordNotice_(noticeEl, itemId, commentId, password);
  }

  function renderPasswordNotice_(noticeEl, itemId, commentId, password) {
    const common = global.AiLabCommon;
    const escapedPassword = common ? common.escapeHTML(password) : password;

    noticeEl.innerHTML = `
      <p class="comment-item__password-display">
        編集・削除用パスワード: <strong data-password-value>${escapedPassword}</strong>(保存しておいてください)
      </p>
      <div class="comment-item__password-change">
        <input type="text" class="comment-item__password-change-input" data-password-change-input placeholder="好きなパスワードに変更する" />
        <button type="button" class="btn btn--ghost btn--small" data-password-change-btn>変更する</button>
        <p class="comment-item__password-change-error" data-password-change-error hidden></p>
      </div>
    `;

    const changeBtn = noticeEl.querySelector("[data-password-change-btn]");
    const changeInput = noticeEl.querySelector("[data-password-change-input]");
    const changeErrorEl = noticeEl.querySelector("[data-password-change-error]");
    if (changeBtn && changeInput) {
      changeBtn.addEventListener("click", async () => {
        const newPassword = changeInput.value.trim();
        if (!newPassword) return;

        const result = await changeCommentPassword(itemId, commentId, password, newPassword);
        if (result && result.ok) {
          fireGtagEvent("comment_password_change", { item_id: itemId, comment_id: commentId });
          renderPasswordNotice_(noticeEl, itemId, commentId, newPassword);
        } else if (changeErrorEl) {
          changeErrorEl.hidden = false;
          changeErrorEl.textContent = "パスワードの変更に失敗しました。もう一度お試しください。";
        }
      });
    }
  }

  global.AiLabComments = {
    submitComment,
    toggleLike,
    editComment,
    deleteComment,
    changeCommentPassword,
    generatePassword,
    savePasswordLocally,
    getLocalPassword,
    GAS_WEBAPP_URL: AiLabCommonRef.GAS_WEBAPP_URL,
    isGasUrlConfigured: isGasUrlConfigured,
  };
})(window);
