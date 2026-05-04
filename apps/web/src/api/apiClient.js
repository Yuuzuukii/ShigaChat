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
