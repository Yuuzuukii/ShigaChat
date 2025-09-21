import React, { useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useNavigate, Outlet, useLocation } from "react-router-dom";
import { toast } from "../lib/utils";
import { UserContext } from "../UserContext";
import { API_BASE_URL, translations } from "../config/constants";
import { fetchNotifications, handleGlobalNotificationMove, handleNotificationClick, handleNotificationMove } from "../utils/notifications";
import { updateUserLanguage } from "../utils/language";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Sidebar, SidebarHeader, SidebarContent } from "./ui/sidebar";
import { Toaster } from "./ui/toaster";
import { PanelLeft, PanelLeftClose, Bell, Globe, Home, Search, Layers, Wrench, MoreHorizontal, Pencil, Trash2, Check, X as XIcon, Plus, LogOut } from "lucide-react";

// Tooltip component
const Tooltip = ({ children, content, isVisible = true }) => {
  if (!isVisible || !content) return children;
  return (
    <div className="group relative w-full overflow-visible">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 z-[200] ml-3 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <div className="relative whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg">
          {content}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>
      </div>
    </div>
  );
};

export default function Navbar({ children }) {
  const { user, token, setUser, setToken, logout } = useContext(UserContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const activeThreadId = useMemo(() => {
    try { 
      return new URLSearchParams(location.search).get('tid'); 
    } catch { 
      return null; 
    }
  }, [location.search]);

  // Language
  const [language, setLanguage] = useState(() => localStorage.getItem("shigachat_lang") || "ja");
  const t = translations[language] || translations.ja;
  const handleLanguageChange = async (val) => {
    setLanguage(val);
    try { localStorage.setItem("shigachat_lang", val); } catch {}
    try { await updateUserLanguage(val, setUser, setToken); } catch {}
  };

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [unreadCount, setUnreadCount] = useState(null);
  const popupRef = useRef(null);
  useEffect(() => {
    if (userId && token) {
      fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount, navigate });
    }
  }, [userId, token, language, navigate]);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) setShowPopup(false);
    };
    if (showPopup) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup]);
  const onNotificationClick = () => handleNotificationClick({ showPopup, setShowPopup, language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount, navigate });
  const onNotificationMove = (n) => handleNotificationMove(n, navigate, token, () => fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount }));
  const onGlobalNotificationMove = (n) => handleGlobalNotificationMove(n, navigate, token, () => fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount }));

  // Sidebar + threads
  const [threads, setThreads] = useState([]);
  const [threadTitleOverrides, setThreadTitleOverrides] = useState(() => {
    try {
      const raw = localStorage.getItem(`thread_title_overrides_${userId ?? 'nouser'}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const saveOverrides = (obj) => {
    try { localStorage.setItem(`thread_title_overrides_${userId ?? 'nouser'}`, JSON.stringify(obj)); } catch {}
  };
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const loadThreads = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/question/get_user_threads`, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) return;
      const data = await resp.json();
      const serverThreads = (data.threads || []).map((th) => ({ id: String(th.thread_id ?? th.id), title: th.title }));
      const withOverrides = serverThreads.map(t => ({ ...t, title: threadTitleOverrides[String(t.id)] ?? t.title }));
      setThreads(withOverrides);
    } catch {}
  }, [token, userId, threadTitleOverrides]);
  
  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => {
    const handler = () => loadThreads();
    const titleChangeHandler = (event) => {
      const { threadId, title } = event.detail;
      console.log('NavBar received title change:', { threadId, title });
      setThreads(prev => prev.map(th => 
        String(th.id) === String(threadId) ? { ...th, title } : th
      ));
    };
    const threadSelectedHandler = (event) => {
      const selectedThreadId = event.detail;
      console.log('NavBar received threadSelected event:', selectedThreadId);
      // Force a re-render to update active state and refresh thread list
      loadThreads();
    };
    
    window.addEventListener('threadCreated', handler);
    window.addEventListener('threadUpdated', handler);
    window.addEventListener('threadTitleChanged', titleChangeHandler);
    window.addEventListener('threadSelected', threadSelectedHandler);
    
    return () => {
      window.removeEventListener('threadCreated', handler);
      window.removeEventListener('threadUpdated', handler);
      window.removeEventListener('threadTitleChanged', titleChangeHandler);
      window.removeEventListener('threadSelected', threadSelectedHandler);
    };
  }, [loadThreads]);
  const selectThread = (id) => {
    const tid = encodeURIComponent(String(id));
    navigate(`/home?tid=${tid}`);
    try { window.dispatchEvent(new CustomEvent('threadSelected', { detail: String(id) })); } catch {}
    setIsDrawerOpen(false);
  };

  // Thread actions (menu per item)
  const [openThreadMenuId, setOpenThreadMenuId] = useState(null);
  const [threadMenuPos, setThreadMenuPos] = useState({ left: 0, top: 0 });
  const [editingThreadId, setEditingThreadId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef(null);
  useEffect(() => {
    if (editingThreadId && editInputRef.current) {
      try { editInputRef.current.focus(); editInputRef.current.select(); } catch {}
    }
  }, [editingThreadId]);
  useEffect(() => {
    const closeMenus = () => setOpenThreadMenuId(null);
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  const startInlineRename = (thread) => {
    setEditingThreadId(String(thread.id));
    setEditingTitle(thread.title || "");
    setOpenThreadMenuId(null);
  };
  const commitInlineRename = () => {
    const id = editingThreadId;
    if (!id) return;
    const title = (editingTitle || "").trim();
    if (!title) { setEditingThreadId(null); return; }
    setThreads(prev => prev.map(th => String(th.id) === String(id) ? { ...th, title } : th));
    setThreadTitleOverrides(prev => {
      const updated = { ...prev, [String(id)]: title };
      saveOverrides(updated);
      return updated;
    });
    setEditingThreadId(null);
  };
  const cancelInlineRename = () => {
    setEditingThreadId(null);
    setEditingTitle("");
  };

  const deleteThread = async (thread) => {
    if (!token) return;
    if (!window.confirm(t?.confirmDeleteThread || 'スレッドを削除しますか？')) return;
    
    try {
      const resp = await fetch(`${API_BASE_URL}/question/delete_thread/${encodeURIComponent(String(thread.id))}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!resp.ok) throw new Error('Failed to delete');
      
      // 削除成功のトーストを表示
      toast.success(t?.threadDeletedSuccess || `スレッド「${thread.title}」を削除しました`, {
        description: t?.threadDeletedDescription || "スレッドが正常に削除されました",
        duration: 3000,
      });
      
      // home.jsに削除されたスレッドを通知
      try {
        window.dispatchEvent(new CustomEvent('threadDeleted', { 
          detail: { threadId: String(thread.id) } 
        }));
      } catch {}
      
      const reload = await fetch(`${API_BASE_URL}/question/get_user_threads`, { headers: { Authorization: `Bearer ${token}` } });
      if (reload.ok) {
        const data2 = await reload.json();
        const serverThreads = (data2.threads || []).map((th) => ({ id: String(th.thread_id ?? th.id), title: th.title }));
        const withOverrides = serverThreads.map(ti => ({ ...ti, title: threadTitleOverrides[String(ti.id)] ?? ti.title }));
        setThreads(withOverrides);
      }
    } catch (e) {
      // 削除失敗のトーストを表示
      toast.error(t?.threadDeletedError || "スレッドの削除に失敗しました", {
        description: t?.threadDeletedErrorDescription || "エラーが発生しました。もう一度お試しください。",
        duration: 4000,
      });
      setThreads(prev => prev.filter(th => String(th.id) !== String(thread.id)));
    } finally {
      setOpenThreadMenuId(null);
    }
  };

  // User menu in sidebar footer
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setShowUserMenu(false);
    };
    if (showUserMenu) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showUserMenu]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_10%_10%,rgba(59,130,246,0.10),transparent_60%),radial-gradient(50%_50%_at_90%_20%,rgba(14,165,233,0.10),transparent_60%),linear-gradient(to_bottom,rgba(239,246,255,1),rgba(255,255,255,1))]" />
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />

      {/* Sidebar */}
      <Sidebar open={true} className="fixed top-0 left-0 z-50 h-screen [&_*]:border-0" style={{ width: isDrawerOpen ? '18rem' : '3.5rem', transition: 'width 300ms ease' }}>
        <div className="flex h-full flex-col">
          <SidebarHeader className="py-8 border-0">
            <div className={`flex items-center ${isDrawerOpen ? 'gap-2 px-2' : 'justify-center'}`}>
              {isDrawerOpen && (
                <div className="text-sm font-semibold text-blue-800">{t.menu || 'Menu'}</div>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent className="flex-1 pt-2 border-0">
            <nav className="mb-6 space-y-1">
              <Tooltip content={t.tooltipHome} isVisible={!isDrawerOpen}>
                <div className={`${isDrawerOpen ? '' : 'flex justify-center items-center'}`}>
                  <Link title={!isDrawerOpen ? t.tooltipHome : undefined} className={`flex items-center rounded text-sm text-zinc-900 transition-all duration-200 hover:bg-blue-50 hover:shadow-sm hover:scale-[1.02] ${isDrawerOpen ? 'gap-3 px-3 py-2' : 'justify-center items-center px-1 py-3'}`} to="/home">
                    <Home className={`text-blue-600 transition-all duration-200 hover:text-blue-700 hover:scale-110 ${isDrawerOpen ? 'h-6 w-6' : 'h-5 w-5'}`} />
                    <span className={isDrawerOpen ? 'inline text-zinc-900 transition-colors duration-200 hover:text-blue-700' : 'hidden'}>{t.home || 'ホーム'}</span>
                  </Link>
                </div>
              </Tooltip>
              <Tooltip content={t.tooltipKeywordSearch} isVisible={!isDrawerOpen}>
                <div className={`${isDrawerOpen ? '' : 'flex justify-center items-center'}`}>
                  <Link title={!isDrawerOpen ? t.tooltipKeywordSearch : undefined} className={`flex items-center rounded text-sm text-zinc-900 transition-all duration-200 hover:bg-blue-50 hover:shadow-sm hover:scale-[1.02] ${isDrawerOpen ? 'gap-3 px-3 py-2' : 'justify-center items-center px-1 py-3'}`} to="/keyword">
                    <Search className={`text-blue-600 transition-all duration-200 hover:text-blue-700 hover:scale-110 ${isDrawerOpen ? 'h-6 w-6' : 'h-5 w-5'}`} />
                    <span className={isDrawerOpen ? 'inline text-zinc-900 transition-colors duration-200 hover:text-blue-700' : 'hidden'}>{t.keyword || 'キーワード検索'}</span>
                  </Link>
                </div>
              </Tooltip>
              <Tooltip content={t.tooltipCategorySearch} isVisible={!isDrawerOpen}>
                <div className={`${isDrawerOpen ? '' : 'flex justify-center items-center'}`}>
                  <Link title={!isDrawerOpen ? t.tooltipCategorySearch : undefined} className={`flex items-center rounded text-sm text-zinc-900 transition-all duration-200 hover:bg-blue-50 hover:shadow-sm hover:scale-[1.02] ${isDrawerOpen ? 'gap-3 px-3 py-2' : 'justify-center items-center px-1 py-3'}`} to="/category">
                    <Layers className={`text-blue-600 transition-all duration-200 hover:text-blue-700 hover:scale-110 ${isDrawerOpen ? 'h-6 w-6' : 'h-5 w-5'}`} />
                    <span className={isDrawerOpen ? 'inline text-zinc-900 transition-colors duration-200 hover:text-blue-700' : 'hidden'}>{t.category || 'カテゴリ検索'}</span>
                  </Link>
                </div>
              </Tooltip>
              <Tooltip content={t.tooltipQuestionManagement} isVisible={!isDrawerOpen}>
                <div className={`${isDrawerOpen ? '' : 'flex justify-center items-center'}`}>
                  <Link title={!isDrawerOpen ? t.tooltipQuestionManagement : undefined} className={`flex items-center rounded text-sm text-zinc-900 transition-all duration-200 hover:bg-blue-50 hover:shadow-sm hover:scale-[1.02] ${isDrawerOpen ? 'gap-3 px-3 py-2' : 'justify-center items-center px-1 py-3'}`} to="/admin/QuestionAdmin">
                    <Wrench className={`text-blue-600 transition-all duration-200 hover:text-blue-700 hover:scale-110 ${isDrawerOpen ? 'h-6 w-6' : 'h-5 w-5'}`} />
                    <span className={isDrawerOpen ? 'inline text-zinc-900 transition-colors duration-200 hover:text-blue-700' : 'hidden'}>{t.questionmanagement || '質問管理'}</span>
                  </Link>
                </div>
              </Tooltip>
            </nav>
            {isDrawerOpen && (
              <>
                <div className="flex items-center justify-between px-2">
                  <div className="text-xs font-semibold text-zinc-500">{t.threads || 'スレッド'}</div>
                  <button
                    onClick={() => navigate('/home')}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-all duration-200 hover:scale-105"
                    title={t.newChat || '新しいチャット'}
                    aria-label="新しいチャットを開始"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="font-medium">{t.newChat || '新規'}</span>
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {threads.map((th) => {
                    const isMenuOpen = openThreadMenuId === String(th.id);
                    const isEditing = editingThreadId === String(th.id);
                    const isActive = activeThreadId && String(activeThreadId) === String(th.id);
                    return (
                      <li key={th.id} className="group relative">
                        <div className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition-all duration-200 
                          ${(isActive || isMenuOpen || isEditing) ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-zinc-900'} 
                           hover:bg-blue-50 hover:text-blue-700 hover:shadow-sm`}>
                          {!isEditing ? (
                            <button className="flex-1 truncate text-left" onClick={() => selectThread(th.id)} title={th.title} aria-current={isActive ? 'true' : undefined}>
                              {th.title}
                            </button>
                          ) : (
                            <div className="flex w-full items-center gap-2">
                              <input
                                ref={editInputRef}
                                className="flex-1 rounded border border-blue-200 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitInlineRename(); }
                                  if (e.key === 'Escape') { e.preventDefault(); cancelInlineRename(); }
                                }}
                                onBlur={commitInlineRename}
                              />
                              <button className="text-green-600 hover:text-green-700" onClick={(e) => { e.stopPropagation(); commitInlineRename(); }} aria-label="Save">
                                <Check className="h-4 w-4" />
                              </button>
                              <button className="text-zinc-500 hover:text-zinc-700" onClick={(e) => { e.stopPropagation(); cancelInlineRename(); }} aria-label="Cancel">
                                <XIcon className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                          {!isEditing && (
                            <button
                              className={`ml-2 transition-opacity duration-150 ${isMenuOpen || isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setThreadMenuPos({ left: Math.round(rect.right + 8), top: Math.round(rect.top + rect.height / 2) });
                                setOpenThreadMenuId(String(th.id));
                              }}
                              aria-label="More actions"
                            >
                              <MoreHorizontal className={`h-5 w-5 ${isMenuOpen || isActive ? 'text-blue-700' : 'text-zinc-500 hover:text-blue-700'}`} />
                            </button>
                          )}
                        </div>
                        {/* menu rendered via fixed portal below */}
                      </li>
                    );
                  })}
                  {threads.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">{t.noThreads || 'まだスレッドがありません'}</li>}
                </ul>
              </>
            )}
          </SidebarContent>
          <div className="p-3" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setShowUserMenu((v) => !v)}
              className={`relative flex w-full items-center rounded px-1 py-1 transition-all duration-200 hover:bg-blue-50 hover:shadow-sm hover:scale-[1.02] ${!isDrawerOpen ? 'justify-center' : ''}`}
              aria-label="User menu"
            >
              <div className={isDrawerOpen ? "relative inline-flex items-center gap-2" : "relative inline-flex items-center"}>
                <span className="relative inline-block">
                  <div className={`flex items-center justify-center rounded-full bg-blue-600 font-semibold text-white transition-all duration-200 hover:bg-blue-700 hover:shadow-md hover:scale-110 ${isDrawerOpen ? 'h-8 w-8 text-sm' : 'h-8 w-8 text-base'}`}>
                    {(user?.nickname || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  {!isDrawerOpen && showUserMenu && (
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 w-40 rounded-md border border-zinc-200 bg-white p-2 shadow-lg">
                      <button
                        className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-800 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-900 hover:scale-[1.02]"
                        onClick={() => { setShowUserMenu(false); logout(); navigate('/new'); }}
                      >
                        <span className="inline-flex items-center gap-2">
                          <LogOut className="h-4 w-4 text-zinc-600" />
                          <span>{t.logout || 'Logout'}</span>
                        </span>
                      </button>
                    </div>
                  )}
                </span>
                <div className={isDrawerOpen ? 'text-sm text-zinc-900 ml-2 transition-colors duration-200 hover:text-blue-700' : 'hidden'}>{user?.nickname || t.guest}</div>
              </div>
              {isDrawerOpen && showUserMenu && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-[60] w-40 rounded-md border border-zinc-200 bg-white p-2 shadow-lg">
                  <button
                    className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-800 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-900 hover:scale-[1.02]"
                    onClick={() => { setShowUserMenu(false); logout(); navigate('/new'); }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <LogOut className="h-4 w-4 text-zinc-600" />
                      <span>{t.logout || 'Logout'}</span>
                    </span>
                  </button>
                </div>
              )}
              {isDrawerOpen && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-chevrons-up-down absolute right-1 top-1/2 -translate-y-1/2"
                >
                  <path d="m7 15 5 5 5-5"/>
                  <path d="m7 9 5-5 5 5"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </Sidebar>

      {/* Top header */}
      <div className="fixed top-0 left-0 right-0 z-40 border-b border-blue-100 bg-white/70 px-5 py-3 backdrop-blur" style={{ marginLeft: isDrawerOpen ? '18rem' : '3.5rem', transition: 'margin-left 300ms ease' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsDrawerOpen(v => !v)} 
              aria-label={isDrawerOpen ? "Collapse sidebar" : "Expand sidebar"}
              className="transition-all duration-200 hover:bg-blue-100 hover:shadow-md hover:scale-110"
            >
              {isDrawerOpen ? <PanelLeftClose className="h-5 w-5 transition-all duration-200 hover:text-blue-700" /> : <PanelLeft className="h-5 w-5 transition-all duration-200 hover:text-blue-700" />}
            </Button>
            <div className="flex items-center gap-5">
              <Link to="/home" className="flex items-center">
                <span
                  className="text-2xl font-bold text-blue-800"
                  style={{
                    color: '#0056b3',
                    fontWeight: 700,
                    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.1)',
                    letterSpacing: '1px'
                  }}
                >
                  ShigaChat
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <a href="https://www.s-i-a.or.jp" target="_blank" rel="noopener noreferrer" aria-label="SIA website">
                  <img src="/sia.png" alt="SIA" className="h-9 w-auto rounded-md object-contain" />
                </a>
                <span className="text-zinc-400">×</span>
                <a href="https://www.si-lab.org/index-ja.html" target="_blank" rel="noopener noreferrer" aria-label="SI-LAB website">
                  <img src="/silab.png" alt="SILAB" className="h-12 w-auto rounded-md object-contain" />
                </a>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative" ref={popupRef}>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onNotificationClick} 
                className="relative h-12 w-12 transition-all duration-200 hover:bg-blue-100 hover:shadow-lg hover:scale-110"
              >
                <Bell className="h-6 w-6 transition-all duration-200 hover:text-blue-700 hover:scale-110" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white animate-pulse">{unreadCount}</span>
                )}
              </Button>
              {showPopup && (
                <div className="absolute right-0 z-50 mt-3 w-80 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-xl selection:bg-blue-200 selection:text-zinc-900">
                  {/* Header */}
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-zinc-800">通知</h3>
                    <div className="flex rounded-lg bg-zinc-100 p-1">
                      <button
                        onClick={() => setActiveTab('personal')} 
                        className={`h-7 px-3 text-xs font-medium rounded transition-all ${
                          activeTab === 'personal' 
                            ? 'bg-white text-blue-600 shadow-sm' 
                            : 'text-zinc-600 hover:text-zinc-800 hover:bg-zinc-50'
                        }`}
                      >
                        {t.personal || '個人'}
                      </button>
                      <button
                        onClick={() => setActiveTab('global')} 
                        className={`h-7 px-3 text-xs font-medium rounded transition-all ${
                          activeTab === 'global' 
                            ? 'bg-white text-blue-600 shadow-sm' 
                            : 'text-zinc-600 hover:text-zinc-800 hover:bg-zinc-50'
                        }`}
                      >
                        {t.global || '全体'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="max-h-96 overflow-y-auto">
                    {activeTab === 'personal' && (
                      <div className="space-y-2">
                        {notifications.length > 0 ? (
                          notifications.map((n) => (
                            <div 
                              key={n.id} 
                              className={`group cursor-pointer rounded-lg border p-3 transition-all hover:border-blue-200 hover:shadow-sm active:bg-blue-100/60 [-webkit-tap-highlight-color:transparent] ${
                                n.is_read 
                                  ? 'border-zinc-100 bg-zinc-50 text-zinc-700' 
                                  : 'border-blue-100 bg-blue-50/30 text-zinc-900'
                              }`} 
                              onClick={() => onNotificationMove(n)}
                            >
                              <div className="mb-1 flex items-start justify-between">
                                <div className="flex-1 pr-2">
                                  <div className={`text-sm leading-relaxed ${n.is_read ? 'text-zinc-700' : 'text-zinc-900 font-medium'}`}>
                                    {n.message}
                                  </div>
                                </div>
                                {!n.is_read && (
                                  <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1"></div>
                                )}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {new Date(n.time).toLocaleString()}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="mb-2 rounded-full bg-zinc-100 p-3">
                              <Bell className="h-6 w-6 text-zinc-400" />
                            </div>
                            <p className="text-sm text-zinc-500">{t.noNotifications || '通知はありません'}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {activeTab === 'global' && (
                      <div className="space-y-2">
                        {globalNotifications.length > 0 ? (
                          globalNotifications.map((n) => {
                            const isRead = Array.isArray(n.read_users) && n.read_users.includes(userId);
                            return (
                              <div 
                                key={n.id} 
                                className={`group cursor-pointer rounded-lg border p-3 transition-all hover:border-blue-200 hover:shadow-sm active:bg-blue-100/60 [-webkit-tap-highlight-color:transparent] ${
                                  isRead 
                                    ? 'border-zinc-100 bg-zinc-50 text-zinc-700' 
                                    : 'border-blue-100 bg-blue-50/30 text-zinc-900'
                                }`} 
                                onClick={() => onGlobalNotificationMove(n)}
                              >
                                <div className="mb-1 flex items-start justify-between">
                                  <div className="flex-1 pr-2">
                                    <div className={`text-sm leading-relaxed ${isRead ? 'text-zinc-700' : 'text-zinc-900 font-medium'}`}>
                                      {n.message}
                                    </div>
                                  </div>
                                  {!isRead && (
                                    <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1"></div>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {new Date(n.time).toLocaleString()}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="mb-2 rounded-full bg-zinc-100 p-3">
                              <Bell className="h-6 w-6 text-zinc-400" />
                            </div>
                            <p className="text-sm text-zinc-500">{t.noNotifications || '通知はありません'}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <Globe className="h-5 w-5 text-blue-600" />
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="h-10 w-[160px] rounded-lg border-blue-200/80 bg-white/80 px-3 text-sm text-blue-700 shadow-sm backdrop-blur transition-all duration-200 hover:shadow-md hover:border-blue-300 hover:bg-white/90 hover:scale-[1.02]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ja">日本語</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="vi">Tiếng Việt</SelectItem>
                  <SelectItem value="ko">한국어</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Thread actions menu (fixed position, outside sidebar to the right) */}
      {openThreadMenuId && (
        <div
          className="fixed z-[200] w-44 -translate-y-1/2 rounded-md border border-zinc-200 bg-white p-1.5 shadow-lg"
          style={{ left: threadMenuPos.left, top: threadMenuPos.top }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-100" onClick={() => {
            const th = threads.find(t => String(t.id) === String(openThreadMenuId));
            if (th) startInlineRename(th);
          }}>
            <Pencil className="h-4 w-4 text-zinc-600" />
            <span>{t?.renameThread || 'タイトル変更'}</span>
          </button>
          <button className="mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => {
            const th = threads.find(t => String(t.id) === String(openThreadMenuId));
            if (th) deleteThread(th);
          }}>
            <Trash2 className="h-4 w-4" />
            <span>{t?.delete || '削除'}</span>
          </button>
        </div>
      )}

      {/* Page content */}
      <main className="h-screen overflow-auto" style={{ marginLeft: isDrawerOpen ? '18rem' : '3.5rem', paddingTop: '4.5rem', transition: 'margin-left 300ms ease' }}>
        <Outlet />
      </main>

      {/* Toaster for notifications */}
      <Toaster isDrawerOpen={isDrawerOpen} />
    </div>
  );
}
