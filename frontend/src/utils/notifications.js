import { API_BASE_URL } from "../config/constants";

export const fetchNotifications = async ({
  language,
  token,
  userId,
  setNotifications,
  setGlobalNotifications,
  setUnreadCount,
}) => {
  try {
    // 🔹 個人通知取得
    const personalRes = await fetch(`${API_BASE_URL}/notification/notifications?lang=${language}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const personalData = await personalRes.json();
    const unreadPersonal = personalData.notifications.filter((n) => !n.is_read).length;

    // 🔹 全体通知取得
    const globalRes = await fetch(`${API_BASE_URL}/notification/notifications/global?lang=${language}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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

    if (!response.ok) throw new Error("通知の既読処理に失敗しました");

    // Navigate to Question Management (admin list by category)
    const categoryRes = await fetch(`${API_BASE_URL}/category/get_category_by_question?question_id=${questionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!categoryRes.ok) throw new Error("カテゴリの取得に失敗しました");
    const categoryData = await categoryRes.json();
    const categoryId = categoryData.category_id;
    await fetchNotifications();
    if (categoryId) {
      navigate(`/admin/category/${categoryId}?id=${questionId}`);
    }
  } catch (error) {
    console.error("通知の既読処理エラー:", error);
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

    const categoryRes = await fetch(`${API_BASE_URL}/category/get_category_by_question?question_id=${questionId}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const categoryData = await categoryRes.json();
    const categoryId = categoryData.category_id;
    if (!categoryId) return;

    const requestData = { id: notification.id };

    const response = await fetch(`${API_BASE_URL}/notification/notifications/global/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) throw new Error("通知の既読処理に失敗しました");

    await fetchNotifications();
    navigate(`/admin/category/${categoryId}?id=${questionId}`);
  } catch (error) {
    console.error("通知の既読処理エラー:", error);
  }
};
