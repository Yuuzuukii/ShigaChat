import { API_BASE_URL } from "../config/constants";
import { redirectToLogin } from "./auth";

export const fetchNotifications = async ({
  language,
  token,
  userId,
  setNotifications,
  setGlobalNotifications,
  setUnreadCount,
  navigate,
}) => {
  try {
    // 🔹 個人通知取得
    const personalRes = await fetch(`${API_BASE_URL}/notification/notifications?lang=${language}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (personalRes.status === 401) {
      if (navigate) redirectToLogin(navigate);
      return;
    }
    const personalData = await personalRes.json();
    const unreadPersonal = personalData.notifications.filter((n) => !n.is_read).length;

    // 🔹 全体通知取得
    const globalRes = await fetch(`${API_BASE_URL}/notification/notifications/global?lang=${language}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (globalRes.status === 401) {
      if (navigate) redirectToLogin(navigate);
      return;
    }
    const globalData = await globalRes.json();
    const unreadGlobal = globalData.filter(
      (n) => !Array.isArray(n.read_users) || !n.read_users.includes(userId)
    ).length;

    // 🔄 ステート更新
    setNotifications(personalData.notifications);
    setGlobalNotifications(globalData);
    setUnreadCount(unreadPersonal + unreadGlobal);
    //console.log("🔔 fetchNotifications called", { language, token, userId });
  } catch (error) {
    console.error("通知取得エラー:", error);
  }
};

/**
 * 通知ボタンをクリックしたときの挙動（表示切り替え＋通知取得）
 */
export const handleNotificationClick = ({
  showPopup,
  setShowPopup,
  language,
  token,
  userId,
  setNotifications,
  setGlobalNotifications,
  setUnreadCount,
  navigate,
}) => {
  setShowPopup((prev) => !prev);
  if (!showPopup) {
    fetchNotifications({
      language,
      token,
      userId,
      setNotifications,
      setGlobalNotifications,
      setUnreadCount,
      navigate,
    });
  }
};

/**
 * 個人通知をクリックして、質問ページに遷移
 */
export const handleNotificationMove = async (notification, navigate, token, fetchNotifications) => {
  try {
    // Prefer structured question_id from API; fallback to legacy message parsing
    const questionId = notification.question_id ?? (() => {
      const m = notification.message && notification.message.match(/ID:\s*(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })();
    if (!questionId) return;

    const requestData = { id: notification.id };

    const response = await fetch(`${API_BASE_URL}/notification/notifications/read`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestData),
    });
    if (response.status === 401) {
      if (navigate) redirectToLogin(navigate);
      return;
    }
    if (!response.ok) throw new Error("通知の既読処理に失敗しました");

    // Navigate to Question Management (admin list by category)
    const categoryRes = await fetch(`${API_BASE_URL}/category/get_category_by_question?question_id=${questionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (categoryRes.status === 401) {
      if (navigate) redirectToLogin(navigate);
      return;
    }
    if (!categoryRes.ok) {
      // Question deleted or category missing: just refresh notifications (already marked read)
      await fetchNotifications();
      return;
    }
    const categoryData = await categoryRes.json();
    const categoryId = categoryData.category_id;
    await fetchNotifications();
    if (categoryId) {
      navigate(`/admin/category/${categoryId}?id=${questionId}`);
    }
  } catch (error) {
    console.error("通知の既読処理エラー:", error);
    // Best-effort: refresh list so the read state reflects immediately
    try { await fetchNotifications(); } catch {}
  }
};

/**
 * 全体通知をクリックして、カテゴリページに遷移
 */
export const handleGlobalNotificationMove = async (notification, navigate, token, fetchNotifications) => {
  try {
    const questionId = notification.question_id ?? (() => {
      const m = notification.message && notification.message.match(/ID:\s*(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })();
    if (!questionId) return;
    // 先に既読化しておく（対象が消えていても通知を閉じるため）
    const markReadReq = fetch(`${API_BASE_URL}/notification/notifications/global/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: notification.id }),
    });

    // カテゴリ取得（存在しない場合はスキップして通知だけ閉じる）
    const categoryRes = await fetch(`${API_BASE_URL}/category/get_category_by_question?question_id=${questionId}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (categoryRes.status === 401) {
      if (navigate) redirectToLogin(navigate);
      return;
    }

    await markReadReq.catch(() => {});

    if (!categoryRes.ok) {
      await fetchNotifications();
      return; // 削除済みなど。通知だけ消す
    }
    const categoryData = await categoryRes.json();
    const categoryId = categoryData.category_id;
    await fetchNotifications();
    if (categoryId) navigate(`/admin/category/${categoryId}?id=${questionId}`);
  } catch (error) {
    console.error("通知の既読処理エラー:", error);
  }
};
