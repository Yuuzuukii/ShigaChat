/**
 * useAuth - 認証ガードとトークン管理
 */
import { useContext, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../contexts/UserContext";

export function useAuth({ requireAuth = true } = {}) {
  const ctx = useContext(UserContext);
  const { fetchUser } = ctx;
  const navigate = useNavigate();

  const redirectToLogin = useCallback(
    (customPath = null) => {
      try {
        const path = customPath || window.location.pathname + window.location.search;
        if (path && path !== "/login" && path !== "/" && !path.startsWith("/register")) {
          localStorage.setItem("redirectAfterLogin", path);
        }
      } catch {}
      navigate("/login");
    },
    [navigate]
  );

  // 認証ガード
  useEffect(() => {
    if (requireAuth && ctx.user === null && !ctx.isLoading) {
      redirectToLogin();
    }
  }, [requireAuth, ctx.user, ctx.isLoading, redirectToLogin]);

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
