/**
 * 集中API呼び出し層
 * 認証ヘッダーの付与と401レスポンスの共通ハンドリングを提供
 */
import { API_BASE_URL } from "../config/constants";

/** 401 処理が既に走っているかを示すモジュールレベルのフラグ */
let _handling401 = false;
export function reset401Flag() {
  _handling401 = false;
}

/**
 * 認証付きfetchラッパー
 * @param {string} path - APIパス（例: "/user/current_user"）
 * @param {object} options - fetch options（method, body, headers等）
 * @param {object} opts - 追加オプション
 * @param {Function} opts.onUnauthorized - 401時のコールバック
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}, { onUnauthorized } = {}) {
  const token = localStorage.getItem("token");
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

  const headers = {
    ...(options.body && typeof options.body === "string" && { "Content-Type": "application/json" }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // 並列リクエストで複数の 401 が同時に返っても、
    // onUnauthorized（→ navigate("/login")）は一度だけ実行する
    if (!_handling401 && typeof onUnauthorized === "function") {
      _handling401 = true;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      onUnauthorized();
    }
    throw new Error("認証エラー: トークンが無効です");
  }

  return response;
}

// ──────── ユーザー系 ────────

export const fetchCurrentUser = (opts) => apiFetch("/user/current_user", {}, opts);

export const postLogin = (username, password) =>
  apiFetch("/user/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }).toString(),
  });

export const postRegister = (name, password, spokenLanguage) =>
  apiFetch("/user/register", {
    method: "POST",
    body: JSON.stringify({ name, password, spoken_language: spokenLanguage }),
  });

export const postChangeLanguage = (languageName, opts) =>
  apiFetch(
    `/user/change_language?language=${encodeURIComponent(languageName)}`,
    { method: "POST" },
    opts
  );

// ──────── スレッド / 質問系 ────────

export const fetchUserThreads = (opts) => apiFetch("/question/get_user_threads", {}, opts);

export const fetchThreadMessages = (threadId, opts) =>
  apiFetch(`/question/get_thread_messages/${encodeURIComponent(String(threadId))}`, {}, opts);

export const deleteThread = (threadId, opts) =>
  apiFetch(
    `/question/delete_thread/${encodeURIComponent(String(threadId))}`,
    { method: "DELETE" },
    opts
  );

export const postGetAnswer = (payload, opts) =>
  apiFetch(
    "/question/get_answer",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    opts
  );

// ──────── アクション系 ────────

export const postAction = (payload, opts) =>
  apiFetch(
    "/action/apply",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    opts
  );

// ──────── キーワード検索系 ────────

export const searchKeyword = (keywords, opts) =>
  apiFetch(`/keyword/search_with_language?keywords=${encodeURIComponent(keywords)}`, {}, opts);

// ──────── カテゴリ系 ────────

export const fetchCategoryTranslation = (categoryId, opts) =>
  apiFetch(`/category/category_translation/${categoryId}`, {}, opts);

export const fetchCategoryQuestions = (categoryId, lang, opts) =>
  apiFetch(`/category/category/${categoryId}?lang=${lang}`, {}, opts);

export const fetchCategoryByQuestion = (questionId, opts) =>
  apiFetch(`/category/get_category_by_question?question_id=${questionId}`, {}, opts);

// ──────── 通知系 ────────

export const fetchPersonalNotifications = (lang, opts) =>
  apiFetch(`/notification/notifications?lang=${lang}`, {}, opts);

export const fetchGlobalNotifications = (lang, opts) =>
  apiFetch(`/notification/notifications/global?lang=${lang}`, {}, opts);

export const markNotificationRead = (notificationId, opts) =>
  apiFetch(
    "/notification/notifications/read",
    {
      method: "PUT",
      body: JSON.stringify({ id: notificationId }),
    },
    opts
  );

export const markAllPersonalRead = (opts) =>
  apiFetch("/notification/notifications/read_all", { method: "PUT" }, opts);

export const markGlobalNotificationRead = (notificationId, opts) =>
  apiFetch(
    "/notification/notifications/global/read",
    {
      method: "POST",
      body: JSON.stringify({ id: notificationId }),
    },
    opts
  );

export const markAllGlobalRead = (opts) =>
  apiFetch("/notification/notifications/global/read_all", { method: "POST" }, opts);

// ──────── 履歴系 ────────

export const addHistory = (questionId, opts) =>
  apiFetch(
    "/history/add_history",
    {
      method: "POST",
      body: JSON.stringify({ question_id: questionId }),
    },
    opts
  );
