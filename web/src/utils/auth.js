// Centralized login redirection helper
export function redirectToLogin(navigate) {
  try {
    localStorage.removeItem("redirectAfterLogin");
  } catch (error) {
    console.warn("リダイレクト情報の削除に失敗:", error);
  }
  
  if (navigate) {
    navigate("/login");
  } else {
    // navigateが利用できない場合は直接リダイレクト
    window.location.href = "/login";
  }
}

// APIリクエスト用の401エラーハンドラー
export function handle401Error(navigate, error, customPath = null) {
  console.warn("⚠️ 401 Unauthorized - 認証が必要です");
  
  // トークンとユーザー情報をクリア
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  
  // ログインページに移動
  redirectToLogin(navigate);
  
  // トークン切れイベントを発火
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tokenExpired", { 
      detail: { error, redirectPath: customPath || window.location?.pathname } 
    }));
  }
}

// 汎用APIフェッチャー（401エラーの自動ハンドリング付き）
export async function fetchWithAuth(url, options = {}, navigate = null) {
  const token = localStorage.getItem("token");
  
  if (!token) {
    if (navigate) redirectToLogin(navigate);
    throw new Error("認証トークンがありません");
  }
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    if (response.status === 401) {
      handle401Error(navigate);
      throw new Error("認証エラー: トークンが無効です");
    }
    
    return response;
  } catch (error) {
    if (error.message.includes("401")) {
      handle401Error(navigate);
    }
    throw error;
  }
}
