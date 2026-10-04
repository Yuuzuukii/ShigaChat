import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { UserContext } from "../../contexts/UserContext";
import { useThreads } from "../home/state/useThreads";
import { useAppViewport, useIsMobile } from "./useResponsiveLayout";
import Header from "./Header";
import AppSidebar from "./Sidebar";
import { Toaster } from "./Toaster";

export default function AppLayout() {
  const { user, token, logout, redirectToLogin, isLoading, language, t } = useContext(UserContext);
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isDrawerOpen = isMobile ? isMobileMenuOpen : isSidebarExpanded;
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);
  const shellRef = useRef(null);
  const contentRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const threadHook = useThreads({ token, userId: user?.id, t, onUnauthorized: redirectToLogin });
  const activeThreadId = useMemo(() => new URLSearchParams(location.search).get("tid"), [location.search]);
  useAppViewport(shellRef, isMobile, !!user);

  useEffect(() => {
    if (!isLoading && !user) redirectToLogin();
  }, [isLoading, user, redirectToLogin]);
  useEffect(closeMobileMenu, [location.pathname, location.search, isMobile, closeMobileMenu]);
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50"><div className="text-sm text-gray-500">Redirecting to login...</div></div>;
  }
  return (
    <div ref={shellRef} className="app-shell relative min-h-screen w-full overflow-hidden" lang={language} data-sidebar-expanded={isSidebarExpanded}>
      {/* Original background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_10%_10%,rgba(59,130,246,0.10),transparent_60%),radial-gradient(50%_50%_at_90%_20%,rgba(14,165,233,0.10),transparent_60%),linear-gradient(to_bottom,rgba(239,246,255,1),rgba(255,255,255,1))]" />
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
      {isMobile && isMobileMenuOpen && <div className="app-drawer-backdrop" onClick={closeMobileMenu} aria-hidden="true" />}
      <AppSidebar isOpen={isDrawerOpen} isMobile={isMobile} onClose={closeMobileMenu} backgroundRef={contentRef}
        user={user} threads={threadHook.threads} activeThreadId={activeThreadId} t={t}
        onSelectThread={(id) => { threadHook.selectThread(id); closeMobileMenu(); }}
        onStartNewChat={() => { threadHook.startNewChat(); closeMobileMenu(); }}
        onRenameThread={threadHook.renameThread} onDeleteThread={threadHook.removeThread} onLogout={logout} />
      <div ref={contentRef} className="app-content">
        <a href="#main-content" className="skip-link">{language === "ja" ? "本文へ移動" : "Skip to content"}</a>
        <Header isDrawerOpen={isDrawerOpen} isMobile={isMobile} t={t}
          onToggleDrawer={() => isMobile ? setIsMobileMenuOpen((open) => !open) : setIsSidebarExpanded((open) => !open)} />
        <main id="main-content" tabIndex={-1} ref={scrollContainerRef}
          className={`app-main h-full overflow-auto${location.pathname === "/home" ? " app-main--chat" : ""}`}>
          <Outlet context={{ language, t, threadHook, isDrawerOpen, isMobile, scrollContainerRef }} />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
