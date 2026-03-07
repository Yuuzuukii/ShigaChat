/**
 * useAuth - 認証ガードとトークン管理
 */
import { useContext, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { UserContext, isForceRedirecting } from "../contexts/UserContext";

export function useAuth({ requireAuth = true } = {}) {
  const ctx = useContext(UserContext);
  const { fetchUser } = ctx;
  const navigate = useNavigate();
  const location = useLocation();

  const redirectToLogin = useCallback(() => {
    // UserContext 側で window.location リダイレクトが進行中なら何もしない
    if (isForceRedirecting()) return;
    // 既にログインページにいる場合は何もしない
    if (location.pathname === "/login") return;
    try {
      localStorage.removeItem("redirectAfterLogin");
    } catch {}
    navigate("/login", { replace: true });
  }, [navigate, location.pathname]);

  // 認証ガード: UserContext 側の forceRedirectToLogin で
  // window.location によるリダイレクトが走っているが、
  // フォールバックとして token も user も無い場合に navigate でも飛ばす
  useEffect(() => {
    if (requireAuth && ctx.user === null && !ctx.isLoading && !ctx.token) {
      redirectToLogin();
    }
  }, [requireAuth, ctx.user, ctx.isLoading, ctx.token, redirectToLogin]);

  // トークン更新イベントリスナー
  useEffect(() => {
    const handleTokenUpdate = () => {
      const latestToken = localStorage.getItem("token");
      if (latestToken) fetchUser(latestToken);
    };
    window.addEventListener("tokenUpdated", handleTokenUpdate);
    return () => window.removeEventListener("tokenUpdated", handleTokenUpdate);
  }, [fetchUser]);

  return {
    user: ctx.user,
    token: ctx.token,
    isLoading: ctx.isLoading,
    setUser: ctx.setUser,
    setToken: ctx.setToken,
    logout: ctx.logout,
    fetchUser: ctx.fetchUser,
    redirectToLogin,
  };
}
