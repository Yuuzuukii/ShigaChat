import React, { useEffect, useState, useContext, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { UserContext } from "../UserContext";
import { updateUserLanguage } from "../utils/language";
import {
    API_BASE_URL,
    translations,
    languageCodeToId,
    languageLabelToCode,
} from "../config/constants";
import {
    fetchNotifications,
    handleNotificationClick,
    handleNotificationMove,
    handleGlobalNotificationMove
} from "../utils/notifications";
import "./Category.css";

function CategoryDetail() {
    const { categoryId } = useParams();
    const [questions, setQuestions] = useState([]);
    const [categoryName, setCategoryName] = useState("");
    const [visibleAnswerId, setVisibleAnswerId] = useState(null);
    const [language, setLanguage] = useState("ja");
    const navigate = useNavigate();
    const { user, token, setToken, setUser, fetchUser } = useContext(UserContext);
    const [notifications, setNotifications] = useState([]);
    const [showPopup, setShowPopup] = useState(false); // ポップアップの表示制御
    const [unreadCount, setUnreadCount] = useState(0);
    const [searchParams] = useSearchParams();
    const questionId = searchParams.get("id");
    const [activeTab, setActiveTab] = useState("personal"); // "personal" または "global"
    const [globalNotifications, setGlobalNotifications] = useState([]); // 全体通知を管理
    const [isNotifLoading, setIsNotifLoading] = useState(true);
    const popupRef = useRef(null);

    const t = translations[language];

    useEffect(() => {
        if (user?.spokenLanguage) {
            const code = languageLabelToCode[user.spokenLanguage];
            if (code) {
                setLanguage(code);
            } else {
                console.warn("❗未対応のspokenLanguage:", user.spokenLanguage);
                setLanguage("ja"); // fallback
            }
        }
    }, [user]);

    useEffect(() => {
        if (user?.id && token) {
            fetchNotifications({
                language,
                token,
                userId: user.id,
                setNotifications,
                setGlobalNotifications,
                setUnreadCount,
            }).finally(() => setIsNotifLoading(false));
        } else {
        }
    }, [user, token]);

    useEffect(() => {
        if (user) {
            fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount });
        }
    }, [language]);

    useEffect(() => {
        if (user === null) {
            navigate("/new");
        }
        const handleTokenUpdate = () => {
            const latestToken = localStorage.getItem("token");
            if (latestToken) {
                fetchUser(latestToken); // ✅ 正常に動作！
            }
        };
        window.addEventListener("tokenUpdated", handleTokenUpdate);
        return () => {
            window.removeEventListener("tokenUpdated", handleTokenUpdate);
        };
    }, [user, navigate, fetchUser]); // ← 依存に fetchUser を追加

    useEffect(() => {
        if (showPopup) {
            document.addEventListener("click", handleClickOutside);
        } else {
            document.removeEventListener("click", handleClickOutside);
        }
        return () => document.removeEventListener("click", handleClickOutside);
    }, [showPopup]);

    useEffect(() => {
        if (questionId) {
            const scrollToQuestion = () => {
                const targetElement = document.getElementById(`question-${questionId}`);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
                } else {
                    console.warn(`質問ID ${questionId} の要素が見つかりません。`);
                }
            };

            // 少し待ってからスクロールを実行する
            const timeout = setTimeout(scrollToQuestion, 300);

            return () => clearTimeout(timeout);
        }
    }, [questionId]);

    useEffect(() => {
        if (user && token) {
            fetchQuestions(
                categoryId,
                user,
                token,
                t,
                setLanguage,
                setCategoryName,
                setQuestions,
                navigate
            );
        }
    }, [categoryId, language, user, token]);

    const handleClickOutside = (event) => {
        if (popupRef.current && !popupRef.current.contains(event.target)) {
            setShowPopup(false);
        }
    };

    const onNotificationClick = () => {
        handleNotificationClick({
            showPopup,
            setShowPopup,
            language,
            token,
            userId,
            setNotifications,
            setGlobalNotifications,
            setUnreadCount,
        });
    };

    const onNotificationMove = (notification) => {
        handleNotificationMove(notification, navigate, token, () => {
            fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount });
        });
    };

    const onGlobalNotificationMove = (notification) => {
        handleGlobalNotificationMove(notification, navigate, token, () => {
            fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount });
        });
    };

    const handleLanguageChange = async (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage); // ローカルの言語設定を変更
        await updateUserLanguage(newLanguage, setUser); // サーバー側の言語設定を更新
    };

    const fetchQuestions = async (categoryId, user, token, t, setLanguage, setCategoryName, setQuestions, navigate) => {
        if (!token || !user) {
            console.error("ユーザー情報またはトークンがありません。");
            navigate("/new");
            return;
        }

        try {
            const lang = languageLabelToCode[user.spokenLanguage] || "ja";
            setLanguage(lang); // UIにも反映

            const categoryResponse = await fetch(`${API_BASE_URL}/category/category_translation/${categoryId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!categoryResponse.ok) {
                throw new Error(t.categorynotfound);
            }

            const categoryData = await categoryResponse.json();
            setCategoryName(categoryData["カテゴリ名"] || t.categorynotfound);

            const response = await fetch(`${API_BASE_URL}/category/category/${categoryId}?lang=${lang}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.status === 401) {
                console.warn("トークンが期限切れです。ログインページへ移動します。");
                navigate("/new");
                return;
            }

            if (!response.ok) {
                throw new Error("サーバーからデータを取得できませんでした");
            }

            const data = await response.json();
            setQuestions(data.questions);
        } catch (error) {
            console.error("エラー:", error);
            setQuestions([]);
        }
    };

    const addHistory = async (questionId) => {
        if (!questionId) {
            console.error("送信する質問IDが存在しません:", questionId);
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/history/add_history`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ question_id: questionId }),
            });
            const responseData = await response.json();
            //console.log("サーバーレスポンス:", responseData);
        } catch (error) {
            console.error("履歴追加中にエラー:", error);
        }
    };

    const toggleAnswer = (questionId) => {
        if (!questionId) {
            console.error("質問IDが取得できません:", questionId);
            return;
        }
        //console.log("質問ID:", questionId);
        setVisibleAnswerId((prevId) => (prevId === questionId ? null : questionId));
        addHistory(questionId);
    };

    const userData = localStorage.getItem("user");
    const userId = userData ? JSON.parse(userData).id : null;

    if (questions === null) {
        return <div>{t.loading}</div>;
    }

    return (
        <div className="category-question-container">
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
                        <button className="notification-button" onClick={onNotificationClick}>
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
                                                    onClick={() => onNotificationMove(notification)}
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
                                                    onClick={() => onGlobalNotificationMove(notification)}
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

            <div className="question-list">
                <h1 className="situmon-header">{`${categoryName}`}</h1>
                {questions.length > 0 ? (
                    questions.map((question) => (
                        <div
                            className="question-item"
                            id={`question-${question.question_id}`}
                            key={question.question_id}
                            onClick={() => toggleAnswer(question.question_id)}
                            style={{ cursor: "pointer" }}
                        >
                            <div className="question-header">
                                <div className="question-text">{question.質問}</div>
                                {question.title === "official" && (
                                    <span className="official-badge">{t.official}</span>
                                )}
                            </div>
                            <div className="question-date" style={{ textAlign: "right" }}>
                                {t.questionDate}
                                {new Date(question.time).toLocaleString()}
                            </div>
                            {visibleAnswerId === question.question_id && (
                                <div className="answer-section">
                                    <strong>{t.answer}</strong>
                                    <p>{question.回答 || t.loading}</p>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <p className="no-questions">{t.noQuestions}</p>
                )}
            </div>
            <button onClick={() => navigate(-1)} className="back-button">
                {t.backButton}
            </button>
        </div>
    );
}

export default CategoryDetail;