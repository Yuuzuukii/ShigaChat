/**
 * useNotifications - 通知管理フック
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPersonalNotifications,
  fetchGlobalNotifications,
  markNotificationRead,
  markGlobalNotificationRead,
  markAllPersonalRead,
  markAllGlobalRead,
  fetchCategoryByQuestion,
} from "../services/api";

export function useNotifications({ token, userId, language, onUnauthorized }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const popupRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const [personalRes, globalRes] = await Promise.all([
        fetchPersonalNotifications(language, { onUnauthorized }),
        fetchGlobalNotifications(language, { onUnauthorized }),
      ]);
      if (!personalRes.ok || !globalRes.ok) return;
      const personalData = await personalRes.json();
      const globalData = await globalRes.json();

      const unreadPersonal = personalData.notifications.filter((n) => !n.is_read).length;
      const unreadGlobal = globalData.filter(
        (n) => !Array.isArray(n.read_users) || !n.read_users.includes(userId)
      ).length;

      setNotifications(personalData.notifications);
      setGlobalNotifications(globalData);
      setUnreadCount(unreadPersonal + unreadGlobal);
    } catch (error) {
      console.error("通知取得エラー:", error);
    }
  }, [token, userId, language, onUnauthorized]);

  // 初回ロード & 言語変更時
  useEffect(() => {
    if (userId && token) refresh();
  }, [userId, token, language]);

  // ポップアップ外クリックで閉じる
  useEffect(() => {
    if (!showPopup) return;
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setShowPopup(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup]);

  const togglePopup = useCallback(() => {
    setShowPopup((prev) => {
      if (!prev) refresh(); // 開く時にリフレッシュ
      return !prev;
    });
  }, [refresh]);

  const onNotificationMove = useCallback(async (notification) => {
    const questionId = notification.question_id ?? (() => {
      const m = notification.message?.match(/ID:\s*(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })();
    if (!questionId) return;

    try {
      const [, categoryResponse] = await Promise.all([
        markNotificationRead(notification.id, { onUnauthorized }),
        fetchCategoryByQuestion(questionId, { onUnauthorized }),
      ]);
      await refresh();
      if (categoryResponse.ok) {
        const data = await categoryResponse.json();
        if (data.category_id) navigate(`/category/${data.category_id}?id=${questionId}`);
      }
    } catch (error) {
      console.error("通知の既読処理エラー:", error);
      try { await refresh(); } catch {}
    }
  }, [token, navigate, refresh, onUnauthorized]);

  const onGlobalNotificationMove = useCallback(async (notification) => {
    const questionId = notification.question_id ?? (() => {
      const m = notification.message?.match(/ID:\s*(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })();
    if (!questionId) return;

    try {
      const [, categoryResponse] = await Promise.all([
        markGlobalNotificationRead(notification.id, { onUnauthorized }),
        fetchCategoryByQuestion(questionId, { onUnauthorized }),
      ]);
      await refresh();
      if (categoryResponse.ok) {
        const data = await categoryResponse.json();
        if (data.category_id) navigate(`/category/${data.category_id}?id=${questionId}`);
      }
    } catch (error) {
      console.error("通知の既読処理エラー:", error);
    }
  }, [token, navigate, refresh, onUnauthorized]);

  const markAllRead = useCallback(async () => {
    try { await markAllPersonalRead({ onUnauthorized }); } catch {}
    try { await markAllGlobalRead({ onUnauthorized }); } catch {}
    try { await refresh(); } catch {}
  }, [refresh, onUnauthorized]);

  return {
    notifications, globalNotifications, unreadCount,
    showPopup, setShowPopup, activeTab, setActiveTab,
    popupRef, togglePopup, refresh,
    onNotificationMove, onGlobalNotificationMove, markAllRead,
  };
}
