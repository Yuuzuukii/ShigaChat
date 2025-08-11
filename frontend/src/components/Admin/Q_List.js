import React, { useEffect, useState, useContext, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { UserContext } from "../../UserContext"; // ユーザー情報を取得
import { updateUserLanguage } from "../../utils/language";
import {
    API_BASE_URL,
    translations,
    languageCodeToId,
    languageLabelToCode,
    categoryList
} from "../../config/constants";
import {
    fetchNotifications,
    handleNotificationClick,
    handleNotificationMove,
    handleGlobalNotificationMove
} from "../../utils/notifications";
import "./Q_List.css"; // 統一されたCSSを利用

const Q_List = () => {
    const { categoryId } = useParams();
    const [questions, setQuestions] = useState([]);
    const [categoryName, setCategoryName] = useState("");
    const [visibleAnswerId, setVisibleAnswerId] = useState(null);
    const [language, setLanguage] = useState("ja");
    const [editingAnswerId, setEditingAnswerId] = useState(null);
    const [editText, setEditText] = useState("");
    const [postedHistory, setPostedHistory] = useState([]);
    const [errorMessage, setErrorMessage] = useState(""); // エラーメッセージ
    const [selectedQuestionId, setSelectedQuestionId] = useState(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [showPopup, setShowPopup] = useState(false); // ポップアップの表示制御
    const [unreadCount, setUnreadCount] = useState(0);
    const [globalNotifications, setGlobalNotifications] = useState([]); // 全体通知を管理
    const [activeTab, setActiveTab] = useState("personal"); // "personal" または "global"
    const [isSaving, setIsSaving] = useState(false);
    const [isNotifLoading, setIsNotifLoading] = useState(true);
    const popupRef = useRef(null);
    const { user, setUser, token, setToken, fetchUser } = useContext(UserContext);

    const t = translations[language]; // 現在の言語の翻訳を取得

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
            //console.log("✅ fetchNotifications を開始:", user?.id);
            fetchNotifications({
                language,
                token,
                userId: user.id,
                setNotifications,
                setGlobalNotifications,
                setUnreadCount,
            }).finally(() => setIsNotifLoading(false));
        } else {
            //console.log("⚠️ user.id または token が未定義のため fetchNotifications をスキップ");
        }
    }, [user, token, language]);

    useEffect(() => {
        //console.log("UserContext 更新後のユーザー情報:", user);
        if (user === null && navigate) {
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
    }, [user, navigate, fetchUser]);

    useEffect(() => {
        if (showPopup) {
            document.addEventListener("click", handleClickOutside);
        } else {
            document.removeEventListener("click", handleClickOutside);
        }
        return () => document.removeEventListener("click", handleClickOutside);
    }, [showPopup]);

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

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage); // 表示を即時反映
        updateUserLanguage(newLanguage, setUser); // サーバー側に反映
    };

    const fetchQuestions = async (categoryId, user, token, t, setLanguage, setCategoryName, setQuestions, navigate) => {
        if (!token || !user) {
            console.error("ユーザー情報またはトークンがありません。");
            if (navigate) {
                navigate("/new");
            }
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

            const response = await fetch(`${API_BASE_URL}/category/category_admin/${categoryId}?lang=${lang}`,{
                    headers: { 
                        Authorization: `Bearer ${token}` 
                    },
            });

            if (response.status === 401) {
                console.warn("トークンが期限切れです。ログインページへ移動します。");
                if (navigate) {
                    navigate("/new");
                }
                return;
            }

            if (!response.ok) {
                throw new Error("サーバーからデータを取得できませんでした");
            }

            const data = await response.json();
            setQuestions((prevHistory = []) => {
                const updatedpublic = data.questions.map((item) => {
                    const existingItem = prevHistory.find(q => q.question_id === item.question_id);
                    return {
                        ...item,
                        public: existingItem ? existingItem.public : item.public, // `public` を保持
                    };
                });
                return updatedpublic;
            });

        } catch (error) {
            console.error("エラー:", error);
            setQuestions([]);
        }
    };

    const handleSaveEdit = async (answerId, questionId) => {
        if (!answerId || isNaN(Number(answerId))) {
            console.error("無効な answerId:", answerId);
            window.alert("回答のIDが無効です。");
            return;
        }

        if (typeof editText === "undefined" || editText.trim() === "") {
            window.alert("回答を入力してください。");
            return;
        }

        setIsSaving(true); // 🔥 保存中の状態に変更

        try {
            const response = await fetch(`${API_BASE_URL}/admin/answer_edit`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    answer_id: Number(answerId),  // 確実に数値で送る
                    new_text: editText.trim(),   // 余分な空白を削除
                }),
            });

            if (!response.ok) {
                let errorMessage = "Failed to update answer";
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } catch (jsonError) {
                    console.error("エラーレスポンスの解析に失敗:", jsonError);
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            //console.log("Updated by user ID:", result.editor_id);
            
            // 即座にUIを更新 - 編集された回答をローカル状態で更新
            setQuestions(prevQuestions => 
                prevQuestions.map(question => {
                    // answerIdでマッチするか、questionIdでマッチするかをチェック
                    const isTargetQuestion = 
                        question.answer_id === Number(answerId) || 
                        (questionId && question.question_id === Number(questionId));
                    
                    if (isTargetQuestion) {
                        return {
                            ...question,
                            回答: editText.trim() // 編集されたテキストで回答を更新
                        };
                    }
                    return question;
                })
            );
            
            setEditingAnswerId(null);
            setEditText(""); // 編集テキストもクリア
            window.alert(t.answerupdated);
            
            // バックグラウンドで最新データを取得（オプション）
            if (typeof fetchQuestions === "function") {
                fetchQuestions().catch(console.error); // エラーが発生してもUIの更新は既に完了している
            }

        } catch (error) {
            console.error("Error updating answer:", error);
            window.alert(`${t.failtoupdate}: ${error.message}`);
            // エラー時は編集状態を維持してユーザーが再試行できるようにする
            // setEditingAnswerId(null); // コメントアウト - エラー時は編集状態を維持
        } finally {
            setIsSaving(false); // 🔥 保存完了後に元に戻す
        }
    };

    const handleEditClick = (questionId, answerId, answerText) => {
        if (editingAnswerId === questionId) {
            // 編集キャンセル
            if (window.confirm("編集をキャンセルしますか？")) {
                setEditingAnswerId(null);
                setEditText("");
                setIsSaving(false); // 保存状態もリセット
            }
        } else {
            // 編集開始
            setEditingAnswerId(questionId);
            setEditText(answerText || "");  // 回答が空の場合、空文字をセット
            setIsSaving(false); // 念のため保存状態をリセット
            //console.log("編集対象の質問ID:", questionId, "回答ID:", answerId);
        }
    };


    const deleteQuestion = async (questionId) => {
        if (!window.confirm(t.confirmDelete)) return;

        try {
            const response = await axios.post(
                `${API_BASE_URL}/admin/delete_question`,
                { question_id: questionId },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            //console.log("削除成功:", response.data);

            // 成功メッセージを表示
            window.alert(t.deleteSuccess || "質問が削除されました");

            // 即座にUIを更新: 削除した質問をリストから削除
            setQuestions((prevQuestions) =>
                prevQuestions.filter((question) => question.question_id !== questionId)
            );

            // バックグラウンドで最新データを取得（オプション）
            // await fetchQuestions();

        } catch (error) {
            console.error("質問削除に失敗:", error);
            setErrorMessage(t.errorDelete);
        }
    };

    const openCategoryModal = (questionId, currentCategoryId) => {
        setSelectedQuestionId(questionId);
        setSelectedCategoryId(currentCategoryId);
        setIsModalOpen(true);
    };

    const closeCategoryModal = () => {
        setIsModalOpen(false);
        setSelectedQuestionId(null);
        setSelectedCategoryId(null);
    };

    const handleChangeCategory = async (newCategoryId, categoryName) => {
        if (!selectedQuestionId) return;

        // ユーザーに選択したカテゴリ名を含めた確認ダイアログを表示
        const confirmChange = window.confirm(`${t.moveto}${categoryName}`);
        if (!confirmChange) return; // キャンセルしたら処理終了

        const requestData = {
            question_id: Number(selectedQuestionId),
            category_id: Number(newCategoryId),
        };

        //console.log("送信データ:", requestData); // ✅ 確認用ログ

        try {
            const response = await fetch(`${API_BASE_URL}/admin/change_category`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify(requestData),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("サーバーレスポンス:", errorText);
                throw new Error("カテゴリ変更に失敗しました");
            }

            // 成功メッセージを表示
            const successMessage = `${t.categorychanged}: ${categoryName}`;
            window.alert(successMessage);
            
            // 即座にUIを更新 - カテゴリ変更された質問をリストから削除
            setQuestions((prevQuestions) =>
                prevQuestions.filter((question) => question.question_id !== selectedQuestionId)
            );
            
            // バックグラウンドで最新データを取得
            fetchQuestions();
            closeCategoryModal(); // モーダルを閉じる
        } catch (error) {
            console.error("カテゴリ変更エラー:", error);
            window.alert(t.failtochangecategory);
        }
    };

    const togglePublicStatus = async (questionId, currentStatus) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/admin/change_public`, {
                question_id: questionId,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            //console.log("APIレスポンス:", response.data);

            // questions も更新
            setQuestions((prevQuestions) =>
                prevQuestions.map((question) =>
                    question.question_id === questionId ? { ...question, public: response.data.public } : question
                )
            );
        } catch (error) {
            console.error(t.publicerror, error);
        }
    };

    const toggleAnswer = (questionId) => {
        if (!questionId) {
            console.error("質問IDが取得できません:", questionId);
            return;
        }
        //console.log("質問ID:", questionId);
        setVisibleAnswerId((prevId) => (prevId === questionId ? null : questionId));
    };

    // userIdの定義
    const userData = localStorage.getItem("user");
    const userId = userData ? JSON.parse(userData).id : null;

    // navigateが正しく初期化されているかチェック
    if (!navigate) {
        console.error("navigate is not initialized");
        return <div>Loading...</div>;
    }

    if (questions === null) {
        return <div>Loading...</div>;
    }

    return (
        <div className="admin-question-history-container">
            <header className="header">
                <div className="language-wrapper">
                    <img src="./../../globe.png" alt="言語" className="globe-icon" />
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
                            <img src="./../../bell.png" alt="通知" className="notification-icon" />
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
            <div className="admin-question-list">
                <h1 className="admin-situmon-header">{`${categoryName}`}</h1>
                {questions.length > 0 ? (
                    questions.map((question) => (
                        <div
                            className="admin-question-item"
                            key={question.question_id}
                            style={{ cursor: "pointer" }}
                        >
                            <div className="admin-question-header" onClick={() => toggleAnswer(question.question_id)}>
                                <div className="admin-question-headline">
                                    <div className="admin-question-text">{question.質問}</div>
                                    <div className="admin-question-meta">
                                        <div className="admin-question-user">{t.editor}: {question.user_name || "—"}</div>
                                        <div className="admin-question-date">
                                            {t.questionDate}{new Date(question.time).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    className="change-category-button"
                                    onClick={(e) => {
                                        e.stopPropagation(); // ヘッダークリック（開閉）とバッティングしないように
                                        openCategoryModal(question.question_id, question.category_id);
                                    }}
                                >
                                    {t.changecategory}
                                </button>
                            </div>


                            {/* ✅ 削除ボタン */}
                            <button className="delete-button" onClick={() => deleteQuestion(question.question_id)}>
                                {t.delete}
                            </button>
                            {visibleAnswerId === question.question_id && (
                                <div className="admin-answer-section">
                                    <strong>{t.answer}</strong>

                                    {/* 編集モードの場合は textarea に変更 */}
                                    {editingAnswerId === question.question_id ? (
                                        <textarea
                                            className="admin-answer-textarea"
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            autoFocus
                                        />

                                    ) : (
                                        <p className="admin-answer-text">{question.回答 || t.loading}</p>
                                    )}

                                    {/* 編集モードの時は保存・キャンセルボタンを表示 */}
                                    {editingAnswerId === question.question_id ? (
                                        <div className="admin-edit-actions">
                                            <button onClick={() => handleSaveEdit(question.answer_id, question.question_id)} disabled={isSaving}>
                                                {isSaving ? "保存中..." : t.save} {/* 🔥 ここでボタンの表示を変更 */}
                                            </button>
                                            <button onClick={() => handleEditClick(question.question_id)} disabled={isSaving}>
                                                {t.cancel}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            className="admin-edit-button"
                                            onClick={() => handleEditClick(question.question_id, question.answer_id, question.回答)}
                                        >
                                            {t.edit}
                                        </button>
                                    )}

                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <p className="admin-no-questions">{t.noQuestions}</p>
                )}
                {/* ✅ カテゴリ選択ポップアップ */}
                {isModalOpen && (
                    <div className="category-modal">
                        <div className="category-modal-content">
                            <h2>{t.selectcategory}</h2>
                            <div className="category-grid">
                                {categoryList.map((category) => (
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
                            <button className="modal-close-button" onClick={closeCategoryModal}>{t.cancel}</button>
                        </div>
                    </div>
                )}
            </div>
            <button onClick={() => navigate && navigate("/admin/QuestionAdmin")} className="admin-back-button">
                {t.backButton}
            </button>
        </div>
    );
};

export default Q_List;

