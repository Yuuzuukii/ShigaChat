/**
 * NotificationPopup - 通知ポップアップ（S00 ヘッダー通知）
 */
import React from "react";
import { Bell } from "lucide-react";
import { Button } from "../ui/button";

export default function NotificationPopup({
  notifications, globalNotifications, unreadCount,
  showPopup, popupRef, activeTab, setActiveTab,
  userId, t,
  onToggle, onNotificationMove, onGlobalNotificationMove, onMarkAllRead,
}) {
  return (
    <div className="relative" ref={popupRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className="relative h-12 w-12 transition-all duration-200 hover:bg-blue-100 hover:shadow-lg hover:scale-110"
      >
        <Bell className="h-6 w-6 transition-all duration-200 hover:text-blue-700" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white animate-pulse">
            {unreadCount}
          </span>
        )}
      </Button>

      {showPopup && (
        <div className="absolute right-0 z-50 mt-3 w-80 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-xl selection:bg-blue-200">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-zinc-800">通知</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onMarkAllRead}
                className="h-7 rounded bg-blue-50 px-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                {t?.markAllRead || "すべて既読"}
              </button>
              <div className="flex rounded-lg bg-zinc-100 p-1">
                <button
                  onClick={() => setActiveTab("personal")}
                  className={`h-7 px-3 text-xs font-medium rounded transition-all ${activeTab === "personal" ? "bg-white text-blue-600 shadow-sm" : "text-zinc-600 hover:text-zinc-800"}`}
                >
                  {t?.personal || "個人"}
                </button>
                <button
                  onClick={() => setActiveTab("global")}
                  className={`h-7 px-3 text-xs font-medium rounded transition-all ${activeTab === "global" ? "bg-white text-blue-600 shadow-sm" : "text-zinc-600 hover:text-zinc-800"}`}
                >
                  {t?.global || "全体"}
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {activeTab === "personal" && (
              <NotificationList
                items={notifications}
                isReadFn={(n) => n.is_read}
                onMove={onNotificationMove}
                emptyText={t?.noNotifications || "通知はありません"}
              />
            )}
            {activeTab === "global" && (
              <NotificationList
                items={globalNotifications}
                isReadFn={(n) => Array.isArray(n.read_users) && n.read_users.includes(userId)}
                onMove={onGlobalNotificationMove}
                emptyText={t?.noNotifications || "通知はありません"}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationList({ items, isReadFn, onMove, emptyText }) {
  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-2 rounded-full bg-zinc-100 p-3">
          <Bell className="h-6 w-6 text-zinc-400" />
        </div>
        <p className="text-sm text-zinc-500">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((n) => {
        const isRead = isReadFn(n);
        return (
          <div
            key={n.id}
            className={`group cursor-pointer rounded-lg border p-3 transition-all hover:border-blue-200 hover:shadow-sm ${isRead ? "border-zinc-100 bg-zinc-50 text-zinc-700" : "border-blue-100 bg-blue-50/30 text-zinc-900"}`}
            onClick={() => onMove(n)}
          >
            <div className="mb-1 flex items-start justify-between">
              <div className="flex-1 pr-2">
                <div className={`text-sm leading-relaxed ${isRead ? "text-zinc-700" : "text-zinc-900 font-medium"}`}>
                  {n.message}
                </div>
              </div>
              {!isRead && <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />}
            </div>
            <div className="text-xs text-zinc-500">{new Date(n.time).toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}
