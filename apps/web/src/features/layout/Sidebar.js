/**
 * Sidebar - サイドバーコンポーネント（S00）
 * ナビゲーション + スレッド管理 + ユーザーメニュー
 */
import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "../common/toast";
import {
  Home,
  Layers,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  LogOut,
} from "lucide-react";
import { Sidebar as SidebarUI, SidebarHeader, SidebarContent } from "../../components/ui/sidebar";
import Tooltip from "../../components/common/Tooltip";
import ConfirmDialog from "../../components/common/ConfirmDialog";

export default function AppSidebar({
  isOpen,
  user,
  threads,
  activeThreadId,
  t,
  onSelectThread,
  onStartNewChat,
  onRenameThread,
  onDeleteThread,
  onLogout,
}) {
  const navigate = useNavigate();

  // Thread actions menu
  const [openThreadMenuId, setOpenThreadMenuId] = useState(null);
  const [threadMenuPos, setThreadMenuPos] = useState({ left: 0, top: 0 });
  const [editingThreadId, setEditingThreadId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef(null);
  const [deleteTargetThread, setDeleteTargetThread] = useState(null);

  // User menu
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    if (editingThreadId && editInputRef.current) {
      try {
        editInputRef.current.focus();
        editInputRef.current.select();
      } catch {}
    }
  }, [editingThreadId]);

  useEffect(() => {
    const close = () => setOpenThreadMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showUserMenu]);

  const startInlineRename = (thread) => {
    setEditingThreadId(String(thread.id));
    setEditingTitle(thread.title || "");
    setOpenThreadMenuId(null);
  };
  const commitInlineRename = () => {
    if (!editingThreadId) return;
    const title = (editingTitle || "").trim();
    if (title) onRenameThread(editingThreadId, title);
    setEditingThreadId(null);
  };
  const cancelInlineRename = () => {
    setEditingThreadId(null);
    setEditingTitle("");
  };

  const handleDeleteThread = async (thread) => {
    const deleted = await onDeleteThread(thread.id, { skipConfirm: true });
    if (deleted) {
      toast.success(t?.threadDeletedSuccess || "スレッドを削除しました", { duration: 3000 });
    } else {
      toast.error(t?.threadDeletedError || "スレッドの削除に失敗しました", {
        description:
          t?.threadDeletedErrorDescription || "エラーが発生しました。もう一度お試しください。",
        duration: 4000,
      });
    }
    setOpenThreadMenuId(null);
  };

  const navItems = [
    { to: "/home", icon: Home, label: t?.home || "ホーム", tooltip: t?.tooltipHome },
    {
      to: "/category",
      icon: Layers,
      label: t?.category || "カテゴリ検索",
      tooltip: t?.tooltipCategorySearch,
    },
  ];

  return (
    <>
      <SidebarUI
        open={true}
        className="fixed top-0 left-0 z-50 h-screen [&_*]:border-0"
        style={{ width: isOpen ? "18rem" : "3.5rem", transition: "width 300ms ease" }}
      >
        <div className="flex h-full flex-col">
          <SidebarHeader className="py-8 border-0">
            <div className={`flex items-center ${isOpen ? "gap-2 px-2" : "justify-center"}`}>
              {isOpen && (
                <div className="text-sm font-semibold text-blue-800">{t?.menu || "Menu"}</div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="flex-1 pt-2 border-0">
            {/* ナビゲーション */}
            <nav className="mb-6 space-y-1">
              {navItems.map(({ to, icon: Icon, label, tooltip }) => (
                <Tooltip key={to} content={tooltip} isVisible={!isOpen}>
                  <div className={isOpen ? "" : "flex justify-center items-center"}>
                    <Link
                      to={to}
                      className={`flex items-center rounded text-sm text-zinc-900 transition-all duration-200 hover:bg-blue-50 hover:shadow-sm hover:scale-[1.02] ${isOpen ? "gap-3 px-3 py-2" : "justify-center px-1 py-3"}`}
                    >
                      <Icon className={`text-blue-600 ${isOpen ? "h-6 w-6" : "h-5 w-5"}`} />
                      <span className={isOpen ? "inline" : "hidden"}>{label}</span>
                    </Link>
                  </div>
                </Tooltip>
              ))}
            </nav>

            {/* スレッド一覧 */}
            {isOpen && (
              <>
                <div className="flex items-center justify-between px-2">
                  <div className="text-xs font-semibold text-zinc-500">
                    {t?.threads || "スレッド"}
                  </div>
                  <button
                    onClick={onStartNewChat}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-all duration-150 group hover:-translate-y-px hover:shadow-sm active:translate-y-px active:shadow-none"
                    title={t?.newChat || "新しいチャット"}
                  >
                    <Plus className="h-3 w-3 group-hover:rotate-90 transition-transform duration-200" />
                    <span className="font-medium">{t?.newChat || "新規"}</span>
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {threads.map((th) => {
                    const isMenuOpen = openThreadMenuId === String(th.id);
                    const isEditing = editingThreadId === String(th.id);
                    const isActive = activeThreadId && String(activeThreadId) === String(th.id);
                    return (
                      <li key={th.id} className="group relative">
                        <div
                          className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition-all duration-200 ${isActive || isMenuOpen || isEditing ? "bg-blue-50 text-blue-700 shadow-sm" : "text-zinc-900"} hover:bg-blue-50 hover:text-blue-700`}
                        >
                          {!isEditing ? (
                            <button
                              className="flex-1 whitespace-normal break-words text-left leading-snug"
                              onClick={() => onSelectThread(th.id)}
                              title={th.title}
                            >
                              {th.title}
                            </button>
                          ) : (
                            <div className="flex w-full items-center gap-2">
                              <input
                                ref={editInputRef}
                                className="flex-1 rounded border border-blue-200 bg-white px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitInlineRename();
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelInlineRename();
                                  }
                                }}
                                onBlur={commitInlineRename}
                              />
                              <button
                                className="text-green-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitInlineRename();
                                }}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                className="text-zinc-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelInlineRename();
                                }}
                              >
                                <XIcon className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                          {!isEditing && (
                            <button
                              className={`ml-2 transition-opacity duration-150 ${isMenuOpen || isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setThreadMenuPos({
                                  left: Math.round(rect.right + 8),
                                  top: Math.round(rect.top + rect.height / 2),
                                });
                                setOpenThreadMenuId(String(th.id));
                              }}
                            >
                              <MoreHorizontal className="h-5 w-5 text-zinc-500 hover:text-blue-700" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {threads.length === 0 && (
                    <li className="px-3 py-2 text-sm text-zinc-500">
                      {t?.noThreads || "まだスレッドがありません"}
                    </li>
                  )}
                </ul>
              </>
            )}
          </SidebarContent>

          {/* ユーザーメニュー */}
          <div className="p-3" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setShowUserMenu((v) => !v)}
              className={`relative flex w-full items-center rounded px-1 py-1 transition-all hover:bg-blue-50 ${!isOpen ? "justify-center" : ""}`}
            >
              <div
                className={
                  isOpen
                    ? "relative inline-flex items-center gap-2"
                    : "relative inline-flex items-center"
                }
              >
                <span className="relative inline-block">
                  <div
                    className={`flex items-center justify-center rounded-full bg-blue-600 font-semibold text-white ${isOpen ? "h-8 w-8 text-sm" : "h-8 w-8 text-base"}`}
                  >
                    {(user?.nickname || "?").trim().charAt(0).toUpperCase()}
                  </div>
                </span>
                <div className={isOpen ? "text-sm text-zinc-900 ml-2" : "hidden"}>
                  {user?.nickname || t?.guest}
                </div>
              </div>
            </button>
            {showUserMenu && (
              <div
                className={`absolute ${isOpen ? "left-full ml-2" : "left-full ml-2"} bottom-3 z-[60] w-40 rounded-md border border-zinc-200 bg-white p-2 shadow-lg`}
              >
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-zinc-800 hover:bg-zinc-100"
                  onClick={() => {
                    setShowUserMenu(false);
                    onLogout();
                    navigate("/login");
                  }}
                >
                  <LogOut className="h-4 w-4 text-zinc-600" />
                  <span>{t?.logout || "Logout"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </SidebarUI>

      {/* Thread actions menu portal */}
      {openThreadMenuId && (
        <div
          className="fixed z-[200] w-44 -translate-y-1/2 rounded-md border border-zinc-200 bg-white p-1.5 shadow-lg"
          style={{ left: threadMenuPos.left, top: threadMenuPos.top }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-100"
            onClick={() => {
              const th = threads.find((t) => String(t.id) === String(openThreadMenuId));
              if (th) startInlineRename(th);
            }}
          >
            <Pencil className="h-4 w-4 text-zinc-600" />
            <span>{t?.renameThread || "タイトル変更"}</span>
          </button>
          <button
            className="mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              const th = threads.find((t) => String(t.id) === String(openThreadMenuId));
              if (th) {
                setDeleteTargetThread(th);
                setOpenThreadMenuId(null);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            <span>{t?.delete || "削除"}</span>
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTargetThread}
        title={t?.confirmDeleteThread || "スレッドを削除しますか？"}
        message={deleteTargetThread?.title || ""}
        confirmLabel={t?.delete || "削除"}
        cancelLabel={t?.cancel || "キャンセル"}
        onCancel={() => setDeleteTargetThread(null)}
        onConfirm={async () => {
          const target = deleteTargetThread;
          setDeleteTargetThread(null);
          if (target) await handleDeleteThread(target);
        }}
      />
    </>
  );
}
