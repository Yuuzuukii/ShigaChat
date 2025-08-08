
import React, { useState, useContext, useEffect, useRef } from "react"; // 修正: useStateをインポート
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../UserContext"; // ユーザー情報を取得
import "./Question_Admin.css";

const API_BASE_URL = "https://si-lab.org/shigachat/api/";

const decodeToken = (token) => {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("トークンのデコードに失敗しました:", error.message);
    return null;
  }
};

// 言語ごとの翻訳データ
const translations = {
  ja: {
    questionmanagement: "質問管理",
    question: "🛠️質問を登録",
    register: "質問登録",
    category: "カテゴリ",
    selectcategory: "カテゴリを選択",
    qtext: "質問",
    answer: "回答",
    public: "公開",
    unpublic: "非公開",
    official: "公式",
    unofficial: "非公式",
    loading: "登録中...",
    close: "閉じる",
    questionerror: "質問を入力してください。",
    answererror: "回答を入力してください。",
    selectcategory: "カテゴリを選択してください。",
    register: "質問を登録しました。",
    register_question: "質問を登録",
    personal: "個人",
    global: "全体",
    noNotifications: "通知はありません。",
  },
  en: {
    questionmanagement: "Question Management",
    question: "🛠️Register a Question",
    register: "Register a Question",
    category: "Category",
    selectcategory: "Select a Category",
    qtext: "Question",
    answer: "Answer",
    public: "Public",
    unpublic: "Unpublic",
    official: "Official",
    unofficial: "Unofficial",
    loading: "Registering...",
    close: "Close",
    questionerror: "Please enter a question.",
    answererror: "Please enter an answer.",
    selectcategory: "Please select a category.",
    register: "Question registered.",
    register_question: "Register a Question",
    personal: "Personal",
    global: "General",
    noNotifications: "No notifications.",
  },
  zh: {
    questionmanagement: "问题管理",
    question: "🛠️注册问题",
    register: "注册问题",
    category: "类别",
    selectcategory: "选择类别",
    qtext: "问题",
    answer: "回答",
    public: "公开",
    unpublic: "不公开",
    official: "官方",
    unofficial: "非官方",
    loading: "注册中...",
    close: "关闭",
    questionerror: "请输入问题。",
    answererror: "请输入答案。",
    selectcategory: "请选择类别。",
    register: "问题已注册。",
    register_question: "注册问题",
    personal: "个人",
    global: "全局",
    noNotifications: "没有通知。",
  },
  ko: {
    questionmanagement: "질문 관리",
    question: "🛠️질문 등록",
    register: "질문 등록",
    category: "카테고리",
    selectcategory: "카테고리 선택",
    qtext: "질문",
    answer: "답변",
    public: "공개",
    unpublic: "비공개",
    official: "공식",
    unofficial: "비공식",
    loading: "등록 중...",
    close: "닫기",
    questionerror: "질문을 입력하세요.",
    answererror: "답변을 입력하세요.",
    selectcategory: "카테고리를 선택하세요.",
    register: "질문이 등록되었습니다.",
    register_question: "질문 등록",
    personal: "개인",
    global: "전체",
    noNotifications: "알림이 없습니다.",
  },
  vi: {
    questionmanagement: "Quản lý câu hỏi",
    question: "🛠️Đăng ký câu hỏi",
    register: "Đăng ký câu hỏi",
    category: "Danh mục",
    selectcategory: "Chọn một danh mục",
    qtext: "Câu hỏi",
    answer: "Trả lời",
    public: "Công khai",
    unpublic: "Không công khai",
    official: "Chính thức",
    unofficial: "Không chính thức",
    loading: "Đang đăng ký...",
    close: "Đóng",
    questionerror: "Vui lòng nhập câu hỏi.",
    answererror: "Vui lòng nhập câu trả lời.",
    selectcategory: "Vui lòng chọn một danh mục.",
    register: "Câu hỏi đã được đăng ký.",
    register_question: "Đăng ký câu hỏi",
    personal: "Cá nhân",
    global: "Toàn cầu",
    noNotifications: "Không có thông báo.",
  },
};

// カテゴリデータ
const categories = [
  { id: 1, name: { ja: "在留・住民手続", en: "Immigration & Residence Procedures", zh: "移民与居留手续", ko: "이민 및 거주 절차", vi: "Thủ tục nhập cư và cư trú" }, className: "category-zairyu" },
  { id: 2, name: { ja: "生活", en: "Life", zh: "生活", ko: "생활", vi: "Cuộc sống" }, className: "category-seikatsu" },
  { id: 3, name: { ja: "医療", en: "Medical", zh: "医疗", ko: "의료", vi: "Y tế" }, className: "category-iryo" },
  { id: 4, name: { ja: "年金・保険", en: "Pension & Insurance", zh: "养老金与保险", ko: "연금 및 보험", vi: "Lương hưu và bảo hiểm" }, className: "category-nenkin" },
  { id: 5, name: { ja: "労働", en: "Labor", zh: "劳动", ko: "노동", vi: "Lao động" }, className: "category-roudou" },
  { id: 6, name: { ja: "教育", en: "Education", zh: "教育", ko: "교육", vi: "Giáo dục" }, className: "category-kyouiku" },
  { id: 7, name: { ja: "結婚・離婚", en: "Marriage & Divorce", zh: "婚姻与离婚", ko: "결혼 및 이혼", vi: "Hôn nhân và ly hôn" }, className: "category-kekkon" },
  { id: 8, name: { ja: "出産・育児", en: "Childbirth & Parenting", zh: "分娩与育儿", ko: "출산 및 양육", vi: "Sinh đẻ và nuôi dạy con cái" }, className: "category-shussan" },
  { id: 9, name: { ja: "住宅", en: "Housing", zh: "住房", ko: "주택", vi: "Nhà ở" }, className: "category-jutaku" },
  { id: 10, name: { ja: "税金", en: "Taxation", zh: "税收", ko: "세금", vi: "Thuế" }, className: "category-zeikin" },
  { id: 11, name: { ja: "福祉", en: "Welfare", zh: "福利", ko: "복지", vi: "Phúc lợi" }, className: "category-fukushi" },
  { id: 12, name: { ja: "事件・事故", en: "Incidents & Accidents", zh: "事件与事故", ko: "사건 및 사고", vi: "Sự cố và tai nạn" }, className: "category-jiken" },
  { id: 13, name: { ja: "災害", en: "Disasters", zh: "灾难", ko: "재해", vi: "Thảm họa" }, className: "category-saigai" },
];

const Question_Admin = () => {
  const navigate = useNavigate();
  const { user, setUser, token, setToken } = useContext(UserContext); // UserContextからユーザー情報を取得
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState(null);
  const [title, setTitle] = useState("official");
  const [content, setContent] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [language, setLanguage] = useState("ja");
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false); // ポップアップの表示制御
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalNotifications, setGlobalNotifications] = useState([]); // 全体通知を管理
  const [activeTab, setActiveTab] = useState("personal"); // "personal" または "global"
  const popupRef = useRef(null);

  const t = translations[language]; // 現在の言語の翻訳を取得


  // 言語切り替えの処理
  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;
    setLanguage(newLanguage); // 即時反映
    updateUserLanguage(newLanguage); // サーバー側に反映
  };

  // トークンを利用して言語を初期設定
  const updateLanguageFromToken = () => {
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = decodeToken(token);
      if (decoded && decoded.spoken_language) {
        const languageMapping = {
          English: "en",
          日本語: "ja",
          "Tiếng Việt": "vi",
          中文: "zh",
          한국어: "ko",
        };
        setLanguage(languageMapping[decoded.spoken_language] || "ja");
      }
    }
  };

  // サーバー, userの言語を更新
  const updateUserLanguage = async (newLanguageCode) => {
    const languageMapping = {
      en: "English",
      ja: "日本語",
      vi: "Tiếng Việt",
      zh: "中文",
      ko: "한국어",
    };
    const newLanguageName = languageMapping[newLanguageCode];

    try {
      const response = await fetch(
        `${API_BASE_URL}/change_language?language=${encodeURIComponent(newLanguageName)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(t.failtoupdate);
      }

      const data = await response.json();
      localStorage.setItem("token", data.access_token);

      // `UserContext` の `spoken_language` を更新
      setUser((prevUser) => ({
        ...prevUser,
        spokenLanguage: newLanguageName,
      }));

      // トークン更新通知
      const event = new Event("tokenUpdated");
      window.dispatchEvent(event);
    } catch (error) {
      console.error(t.failtoupdate);
    }
  };

  const handleCategoryClick = (id) => {
    navigate(`/admin/category/${id}`);
  };

  // ユーザー情報の取得を待つ
  useEffect(() => {
    updateLanguageFromToken();

    const handleTokenUpdate = () => {
      updateLanguageFromToken();
    };

    // トークン更新イベントを監視
    window.addEventListener("tokenUpdated", handleTokenUpdate);

    return () => {
      window.removeEventListener("tokenUpdated", handleTokenUpdate);
    };
  }, []);
  useEffect(() => {
    if (user === null) {
      navigate("/new");
    }
  }, [user, navigate]);

  const openCategoryModal = () => {
    setIsCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
  };

  const openRegisterModal = () => {
    setIsRegisterModalOpen(true);
  };

  const closeRegisterModal = () => {
    setIsRegisterModalOpen(false);
  };

  const handleChangeCategory = (id, name) => {
    setSelectedCategoryId(id);
    setSelectedCategoryName(name);
    closeCategoryModal();
  };


  const handleRegisterQuestion = async () => {
    if (!content.trim()) {
      setErrorMessage(`${t.questionerror}`);
      return;
    }

    if (!answerText.trim()) {
      setErrorMessage(`${t.answererror}`);
      return;
    }

    if (!selectedCategoryId) {
      setErrorMessage(`${t.selectcategory}`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/register_question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category_id: selectedCategoryId,
          title: title === "official" ? "official" : "ユーザー質問",
          content,
          public: isPublic,
          answer_text: answerText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("サーバーレスポンス:", errorData);
        throw new Error(errorData.detail || "質問の登録に失敗しました。");
      }

      const data = await response.json();
      alert(`${t.register}`);
      clearForm();

    } catch (error) {
      console.error("質問登録エラー:", error);
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearForm = () => {
    setContent("");
    setAnswerText("");
    setSelectedCategoryId(null);
    setSelectedCategoryName("");
    setTitle("official");
    setIsPublic(true);
  };

  const userData = localStorage.getItem("user");
  const userId = userData ? JSON.parse(userData).id : null;

  // 🔄 通知を取得する関数（個人 + 全体通知対応）
  const fetchNotifications = async (lang = language) => {
    try {
      console.log(`通知を取得: 言語=${lang}`);

      // 🔹 個人通知を取得
      const personalResponse = await fetch(`${API_BASE_URL}/notifications?lang=${lang}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!personalResponse.ok) throw new Error("個人通知の取得に失敗しました");

      const personalData = await personalResponse.json();

      // 🔹 個人通知の未読数
      const unreadPersonal = personalData.notifications.filter((n) => !n.is_read).length;

      // 🔹 全体通知を取得
      const globalResponse = await fetch(`${API_BASE_URL}/notifications/global?lang=${lang}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!globalResponse.ok) throw new Error("全体通知の取得に失敗しました");

      const globalData = await globalResponse.json();

      // 🔹 全体通知の未読数
      const unreadGlobal = globalData.filter(
        (n) => !Array.isArray(n.read_users) || !n.read_users.map(Number).includes(userId)
      ).length;

      // 🔄 ステートを更新
      setNotifications(personalData.notifications);
      setGlobalNotifications(globalData);
      setUnreadCount(unreadPersonal + unreadGlobal);

    } catch (error) {
      console.error("通知の取得エラー:", error);
    }
  };

  const handleNotificationClick = () => {
    setShowPopup((prev) => !prev);
    if (!showPopup) {
      fetchNotifications(language);
    }
  };

  const handleClickOutside = (event) => {
    console.log("クリックされた要素:", event.target);
    console.log("ポップアップの要素:", popupRef.current);

    if (popupRef.current && !popupRef.current.contains(event.target)) {
      console.log("ポップアップ外がクリックされたので閉じる");
      setShowPopup(false);
    }
  };


  useEffect(() => {
    if (showPopup) {
      console.log("🔄 イベントリスナーを追加");
      document.addEventListener("click", handleClickOutside);
    } else {
      console.log("❌ イベントリスナーを削除");
      document.removeEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showPopup]);




  const handleNotificationMove = async (notification) => {
    try {
      console.log("クリックした通知の情報:", notification);

      const questionIdMatch = notification.message.match(/ID:\s*(\d+)/);
      const questionId = questionIdMatch ? parseInt(questionIdMatch[1], 10) : null;

      if (!questionId) {
        console.error("通知から質問IDを取得できません:", notification.message);
        return;
      }

      console.log("抽出された質問ID:", questionId);

      // 🔹 APIに送信するデータフォーマットを `id: int` に修正
      const requestData = { id: notification.id }; // ✅ ここを修正

      console.log("送信するデータ:", requestData);

      // 🔄 既読にする API を呼び出し
      const response = await fetch(`${API_BASE_URL}/notifications/read`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(requestData), // ✅ `id: int` の形式に修正
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("既読APIエラー:", errorText);
        throw new Error("通知の既読処理に失敗しました");
      }

      console.log("通知を既読にしました:", notification.id);

      // 🔄 未読通知を更新
      await fetchNotifications();

      // 🔄 質問履歴ページに遷移
      navigate(`/Shitsumonnrireki?id=${questionId}`);

    } catch (error) {
      console.error("通知の既読処理エラー:", error);
    }
  };

  const handleGlobalNotificationMove = async (notification) => {
    try {
      console.log("クリックした通知の情報:", notification);

      const questionIdMatch = notification.message.match(/ID:\s*(\d+)/);
      const questionId = questionIdMatch ? parseInt(questionIdMatch[1], 10) : null;

      if (!questionId) {
        console.error("通知から質問IDを取得できません:", notification.message);
        return;
      }

      console.log("抽出された質問ID:", questionId);

      const categoryResponse = await fetch(`${API_BASE_URL}/get_category_by_question?question_id=${questionId}`, {
        method: "GET", // ✅ 明示的に GET を指定
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!categoryResponse.ok) {
        throw new Error("質問に対応するカテゴリを取得できませんでした");
      }

      const categoryData = await categoryResponse.json();
      const categoryId = categoryData.category_id;

      if (!categoryId) {
        console.error("カテゴリIDを取得できませんでした:", categoryData);
        return;
      }

      console.log("取得したカテゴリID:", categoryId);

      // 🔹 既読処理（APIリクエスト）
      const requestData = { id: notification.id };

      const response = await fetch(`${API_BASE_URL}/notifications/global/read`, { // ✅ 修正: 正しいエンドポイントを使用
        method: "POST", // ✅ 修正: `PUT` → `POST`
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("既読APIエラー:", errorText);
        throw new Error("通知の既読処理に失敗しました");
      }

      console.log("通知を既読にしました:", notification.id);

      // 🔄 未読通知を更新
      await fetchNotifications();

      // 🔄 カテゴリページに正しく遷移
      navigate(`/category/${categoryId}?id=${questionId}`);

    } catch (error) {
      console.error("通知の既読処理エラー:", error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications(language);
    }
  }, [user, language]); // 言語とトークンが変わるたびに実行

  return (
    <div className="admin-container-kategori">
      <header className="header">
        <div className="language-wrapper">
          <img src="./../globe.png" alt="言語" className="globe-icon" />
          <select className="languageSelector" onChange={handleLanguageChange} value={language}>
            <option value="ja">日本語</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="vi">Tiếng Việt</option>
            <option value="ko">한국어</option>
          </select>
        </div>
        <h1>Shiga Chat</h1>
        {/* ユーザーアイコンと通知をまとめたラッパー */}
        <div className="user-notification-wrapper">
          {/* 🔔 通知ボタン（画像版） */}
          <div className={`notification-container ${showPopup ? "show" : ""}`}>
            {/* 🔔 通知ボタン */}
            <button className="notification-button" onClick={handleNotificationClick}>
              <img src="./../bell.png" alt="通知" className="notification-icon" />
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>

            {/* 🔔 通知ポップアップ */}
            {showPopup && (
              <div className="notification-popup" ref={popupRef}>
                {/* タブ切り替えボタン */}
                <div className="tabs">
                  <button onClick={() => setActiveTab("personal")} className={activeTab === "personal" ? "active" : ""}>
                    {t.personal}
                  </button>
                  <button onClick={() => setActiveTab("global")} className={activeTab === "global" ? "active" : ""}>
                    {t.global}
                  </button>
                </div>

                <div className="notifications-list">
                  {/* 🔹 個人通知リスト */}
                  {activeTab === "personal" && (
                    notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`notification-item ${notification.is_read ? "read" : "unread"}`}
                          onClick={() => handleNotificationMove(notification)}
                        >
                          {notification.message}
                          <span className="time">{new Date(notification.time).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p>{t.noNotifications}</p> // 🔹 個人通知がない場合のメッセージ
                    )
                  )}

                  {/* 🔹 全体通知リスト */}
                  {activeTab === "global" && (
                    globalNotifications.length > 0 ? (
                      globalNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`notification-item ${Array.isArray(notification.read_users) && notification.read_users.includes(userId) ? "read" : "unread"}`}
                          onClick={() => handleGlobalNotificationMove(notification)}
                        >
                          {notification.message}
                          <span className="time">{new Date(notification.time).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p>{t.noNotifications}</p> // 🔹 全体通知がない場合のメッセージ
                    )
                  )}
                </div>
              </div>
            )}
          </div>
          {/* ユーザー名 */}
          <div className="userIcon">
            {user ? `${user.nickname} ` : t.guest}
          </div>
        </div>
      </header>
      <div className="admin-body">
        <h1 className="question-admin">{t.questionmanagement}</h1>
        <div>
          <div className="admin-category-container">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`admin-category-button admin-${category.className}`}
                onClick={() => handleCategoryClick(category.id)}
              >
                {category.name[language]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className="reg" onClick={openRegisterModal}>
        {t.question}
      </button>
      {isRegisterModalOpen && (
        <div className="register-modal">
          <div className="register-container">
            <h1>{t.register_question}</h1>
            {errorMessage && <p className="error-message">{errorMessage}</p>}

            <label>{t.category}:　{selectedCategoryName}</label>
            <button className="category-button" onClick={openCategoryModal}>
              {t.selectcategory}
            </button>

            <label>{t.qtext}:</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)}></textarea>

            <label>{t.answer}:</label>
            <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)}></textarea>

            <div className="toggle-wrapper">
              <div className="title-buttons">
                <button
                  className={`title-button ${title === "official" ? "active" : ""}`}
                  onClick={() => setTitle("official")}
                >
                  {t.official}
                </button>
                <button
                  className={`title-button ${title === "unofficial" ? "active" : ""}`}
                  onClick={() => setTitle("unofficial")}
                >
                  {t.unofficial}
                </button>
              </div>
              <div className="toggle-container">
                <span className="toggle-text">{isPublic ? t.public : t.unpublic}</span>
                <div className={`toggle-switch ${isPublic ? "active" : ""}`} onClick={() => setIsPublic(!isPublic)}>
                  <div className="toggle-circle"></div>
                </div>
              </div>
            </div>

            <button className="register" onClick={handleRegisterQuestion} disabled={isSubmitting}>
              {isSubmitting ? t.loading : t.register_question}
            </button>
            <button className="close" onClick={closeRegisterModal}>{t.close}</button>
          </div>
        </div>
      )}
      {/* ✅ カテゴリ選択ポップアップ */}
      {isCategoryModalOpen && (
        <div className="category-modal">
          <div className="category-modal-content">
            <h2>{t.selectcategory}</h2>
            <div className="category-grid">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`category-option-button ${category.className}`}
                  onClick={() => handleChangeCategory(category.id, category.name[language] || category.name.ja)}
                  disabled={category.id === selectedCategoryId} // ✅ 現在のカテゴリは選択不可
                >
                  {category.name[language] || category.name.ja}
                </button>
              ))}
            </div>
            <button className="modal-close-button" onClick={closeCategoryModal}>{t.close}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Question_Admin;