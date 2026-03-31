/**
 * AppLayout - S00 共通レイアウト（Header + Sidebar + Outlet）
 * 認証後ページ共通のルートレイアウト
 */
import React, { useState, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useThreads } from "../../hooks/useThreads";
import Header from "./Header";
import AppSidebar from "./Sidebar";
import { Toaster } from "../ui/toaster";

export default function AppLayout() {
  const { user, token, logout, redirectToLogin } = useAuth({ requireAuth: true });
  const { language, t, changeLanguage } = useLanguage();
  const userId = user?.id;
  const onUnauthorized = redirectToLogin;

  const location = useLocation();
  const activeThreadId = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("tid");
    } catch {
      return null;
    }
  }, [location.search]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  const threadHook = useThreads({ token, userId, t, onUnauthorized });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <div className="text-sm text-gray-500">Redirecting to login...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_10%_10%,rgba(59,130,246,0.10),transparent_60%),radial-gradient(50%_50%_at_90%_20%,rgba(14,165,233,0.10),transparent_60%),linear-gradient(to_bottom,rgba(239,246,255,1),rgba(255,255,255,1))]" />
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />

      {/* Sidebar */}
      <AppSidebar
        isOpen={isDrawerOpen}
        user={user}
        threads={threadHook.threads}
        activeThreadId={activeThreadId}
        t={t}
        onSelectThread={threadHook.selectThread}
        onStartNewChat={threadHook.startNewChat}
        onRenameThread={threadHook.renameThread}
        onDeleteThread={threadHook.removeThread}
        onLogout={logout}
      />

      {/* Header */}
      <Header
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen((v) => !v)}
        language={language}
        onLanguageChange={changeLanguage}
      />

      {/* Page content */}
      <main
        className="h-screen overflow-auto"
        style={{
          marginLeft: isDrawerOpen ? "18rem" : "3.5rem",
          paddingTop: "4.5rem",
          transition: "margin-left 300ms ease",
          scrollBehavior: "smooth",
        }}
      >
        <Outlet context={{ language, t, changeLanguage, threadHook }} />
      </main>

      <Toaster isDrawerOpen={isDrawerOpen} />
    </div>
  );
}
