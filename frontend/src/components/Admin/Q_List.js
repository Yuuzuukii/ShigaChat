import React, { useEffect, useState, useContext, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { UserContext } from "../../UserContext"; // ユーザー情報を取得
import { updateUserLanguage } from "../../utils/language";
import {
  API_BASE_URL,
  translations,
  languageLabelToCode,
  categoryList,
} from "../../config/constants";
import {
  fetchNotifications,
  handleNotificationClick,
  handleNotificationMove,
  handleGlobalNotificationMove,
} from "../../utils/notifications";
import "./Q_List.css";
import { redirectToLogin } from "../../utils/auth";
import RichText from "../common/RichText";

// RichText moved to common component

const Q_List = () => {
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const targetQuestionId = Number(searchParams.get("id")) || null;

  const [questions, setQuestions] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [visibleAnswerId, setVisibleAnswerId] = useState(null);
  const [language, setLanguage] = useState("ja");
  const [editingAnswerId, setEditingAnswerId] = useState(null);
  const [editText, setEditText] = useState("");
  const [historyOpenId, setHistoryOpenId] = useState(null);
  const [historyMap, setHistoryMap] = useState({}); // {answer_id: [{texts, edited_at, editor_name}, ...]}
  const [historyDiffOpenMap, setHistoryDiffOpenMap] = useState({}); // {`${answerId}:${idx}`: true}
  const [postedHistory, setPostedHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState("personal");
  const [isSaving, setIsSaving] = useState(false);
  const [isNotifLoading, setIsNotifLoading] = useState(true);
  const popupRef = useRef(null);

  const { user, setUser, token, setToken, fetchUser } = useContext(UserContext);
  const t = translations[language];

  const fmtTime = (s) => {
    try {
      if (!s) return '';
      const isoish = String(s).replace(' ', 'T');
      const out = new Date(isoish).toLocaleString();
      return out.replace(/\u30fb/g, ' ');
    } catch { return String(s || ''); }
  };

  // spokenLanguage → UI言語
  useEffect(() => {
    if (user && user.spokenLanguage) {
      const code = languageLabelToCode[user.spokenLanguage];
      setLanguage(code || "ja");
    }
  }, [user]);

  // 通知
  useEffect(() => {
    if (user && user.id && token) {
      fetchNotifications({
        language,
        token,
        userId: user.id,
        setNotifications,
        setGlobalNotifications,
        setUnreadCount,
      }).finally(() => setIsNotifLoading(false));
    }
  }, [user, token, language]);

  // トークン更新イベント
  useEffect(() => {
    if (user === null && navigate) {
      redirectToLogin(navigate);
    }
    const handleTokenUpdate = () => {
      const latestToken = localStorage.getItem("token");
      if (latestToken) {
        fetchUser(latestToken);
      }
    };
    window.addEventListener("tokenUpdated", handleTokenUpdate);
    return () => window.removeEventListener("tokenUpdated", handleTokenUpdate);
  }, [user, navigate, fetchUser]);

  // 通知ポップアップ外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowPopup(false);
      }
    };
    if (showPopup) {
      document.addEventListener("click", handleClickOutside);
    }
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup]);

  // 質問の取得
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

  // 特定質問へスクロール
  useEffect(() => {
    if (!targetQuestionId || !questions || questions.length === 0) return;
    const el = document.getElementById(`admin-question-${targetQuestionId}`);
    if (el) {
      const container = document.querySelector(".admin-question-history-container");
      if (container) {
        const offset = el.offsetTop - container.offsetTop - 80;
        container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      el.classList.add("target-highlight");
      setTimeout(() => el.classList.remove("target-highlight"), 2000);
    }
  }, [targetQuestionId, questions]);

  // userId（通知の既読判定用）
  const userData = localStorage.getItem("user");
  const userId = userData ? JSON.parse(userData).id : null;

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
      fetchNotifications({
        language,
        token,
        userId,
        setNotifications,
        setGlobalNotifications,
        setUnreadCount,
      });
    });
  };

  const onGlobalNotificationMove = (notification) => {
    handleGlobalNotificationMove(notification, navigate, token, () => {
      fetchNotifications({
        language,
        token,
        userId,
        setNotifications,
        setGlobalNotifications,
        setUnreadCount,
      });
    });
  };

  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;
    setLanguage(newLanguage);
    updateUserLanguage(newLanguage, setUser);
  };

  async function fetchQuestions(
    categoryId,
    user,
    token,
    t,
    setLanguage,
    setCategoryName,
    setQuestions,
    navigate
  ) {
    if (!token || !user) {
      console.error("ユーザー情報またはトークンがありません。");
      if (navigate) redirectToLogin(navigate);
      return;
    }
    try {
      const lang = languageLabelToCode[user.spokenLanguage] || "ja";
      setLanguage(lang);

      const categoryResponse = await fetch(
        `${API_BASE_URL}/category/category_translation/${categoryId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!categoryResponse.ok) throw new Error(t.categorynotfound);

      const categoryData = await categoryResponse.json();
      setCategoryName(categoryData["カテゴリ名"] || t.categorynotfound);

      const response = await fetch(
        `${API_BASE_URL}/category/category_admin/${categoryId}?lang=${lang}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.status === 401) {
        console.warn("トークンが期限切れです。ログインページへ移動します。");
        if (navigate) redirectToLogin(navigate);
        return;
      }
      if (!response.ok) throw new Error("サーバーからデータを取得できませんでした");

      const data = await response.json();
      setQuestions((prevHistory = []) => {
        const updated = data.questions.map((item) => {
          const existed = prevHistory.find((q) => q.question_id === item.question_id);
          return { ...item, public: existed ? existed.public : item.public };
        });
        return updated;
      });
    } catch (error) {
      console.error("エラー:", error);
      setQuestions([]);
    }
  }

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

    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/answer_edit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          answer_id: Number(answerId),
          new_text: editText.trim(),
        }),
      });

      if (!response.ok) {
        let msg = "Failed to update answer";
        try {
          const errorData = await response.json();
          msg = errorData.detail || msg;
        } catch {}
        throw new Error(msg);
      }

      // 即時UI更新
      setQuestions((prev) =>
        prev.map((q) => {
          const isTarget =
            q.answer_id === Number(answerId) ||
            (questionId && q.question_id === Number(questionId));
          if (isTarget) {
            return {
              ...q,
              回答: editText.trim(),
              editor_name: user && user.nickname ? user.nickname : q.editor_name,
            };
          }
          return q;
        })
      );

      setEditingAnswerId(null);
      setEditText("");
      // 即時に履歴を更新（該当回答の履歴パネルが開いている場合）
      try {
        if (historyOpenId === answerId) {
          const key = `${answerId}:${language}`;
          const res = await fetch(`${API_BASE_URL}/admin/answer_history?answer_id=${encodeURIComponent(answerId)}&lang=${encodeURIComponent(language)}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          if (res.ok) {
            const data = await res.json();
            setHistoryMap(prev => ({ ...prev, [key]: data.history || [] }));
          } else {
            // invalidate cache to force reload next toggle
            setHistoryMap(prev => ({ ...prev, [key]: [] }));
          }
        }
      } catch (e) {
        console.warn('Failed to refresh history immediately:', e);
      }
      window.alert(t.answerupdated);

      try {
        await fetchQuestions(
          categoryId,
          user,
          token,
          t,
          setLanguage,
          setCategoryName,
          setQuestions,
          navigate
        );
      } catch {}
    } catch (error) {
      console.error("Error updating answer:", error);
      window.alert(`${t.failtoupdate}: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (questionId, answerId, answerText) => {
    if (editingAnswerId === questionId) {
      if (window.confirm("編集をキャンセルしますか？")) {
        setEditingAnswerId(null);
        setEditText("");
        setIsSaving(false);
      }
    } else {
      setEditingAnswerId(questionId);
      setEditText(answerText || "");
      setIsSaving(false);
    }
  };

  const toggleHistory = async (answerId) => {
    setHistoryOpenId(prev => (prev === answerId ? null : answerId));
    if (!answerId) return;
    const key = `${answerId}:${language}`;
    if (historyMap[key]) return; // already loaded for this language
    try {
      const res = await fetch(`${API_BASE_URL}/admin/answer_history?answer_id=${encodeURIComponent(answerId)}&lang=${encodeURIComponent(language)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setHistoryMap(prev => ({ ...prev, [key]: data.history || [] }));
    } catch (e) {
      console.error('Failed to load answer history', e);
      setHistoryMap(prev => ({ ...prev, [key]: [] }));
    }
  };

  // --- Simple git-like diff (line-based LCS) ---
  const lcsMatrix = (a, b) => {
    const n = a.length, m = b.length;
    const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    return dp;
  };

  const diffLines = (oldText = "", newText = "") => {
    const A = String(oldText).split(/\r?\n/);
    const B = String(newText).split(/\r?\n/);
    const dp = lcsMatrix(A, B);
    const parts = [];
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) {
        parts.push({ type: 'same', text: A[i] });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        parts.push({ type: 'del', text: A[i] });
        i++;
      } else {
        parts.push({ type: 'add', text: B[j] });
        j++;
      }
    }
    while (i < A.length) { parts.push({ type: 'del', text: A[i++] }); }
    while (j < B.length) { parts.push({ type: 'add', text: B[j++] }); }
    return parts;
  };

  const renderDiff = (oldText, newText) => {
    const segs = diffLines(oldText, newText);
    return (
      <div className="diff-block">
        {segs.map((p, idx) => (
          <div key={idx} className={`diff-line diff-${p.type}`}>{p.text || '\u00A0'}</div>
        ))}
      </div>
    );
  };

  const deleteQuestion = async (questionId) => {
    if (!window.confirm(t.confirmDelete)) return;

    try {
      await axios.post(
        `${API_BASE_URL}/admin/delete_question`,
        { question_id: questionId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      window.alert(t.deleteSuccess || "質問が削除されました");
      setQuestions((prev) => prev.filter((q) => q.question_id !== questionId));
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

    const confirmChange = window.confirm(`${t.moveto}${categoryName}`);
    if (!confirmChange) return;

    const requestData = {
      question_id: Number(selectedQuestionId),
      category_id: Number(newCategoryId),
    };

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

      window.alert(`${t.categorychanged}: ${categoryName}`);
      setQuestions((prev) => prev.filter((q) => q.question_id !== selectedQuestionId));

      // 必要なら最新再取得
      // await fetchQuestions(...)

      closeCategoryModal();
    } catch (error) {
      console.error("カテゴリ変更エラー:", error);
      window.alert(t.failtochangecategory);
    }
  };

  const togglePublicStatus = async (questionId, currentStatus) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/admin/change_public`,
        { question_id: questionId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setQuestions((prev) =>
        prev.map((q) =>
          q.question_id === questionId
            ? {
                ...q,
                public: response.data.public,
                editor_name: user && user.nickname ? user.nickname : q.editor_name,
              }
            : q
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
    setVisibleAnswerId((prevId) => (prevId === questionId ? null : questionId));
  };

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

        <div className="user-notification-wrapper">
          <div className={`notification-container ${showPopup ? "show" : ""}`}>
            <button className="notification-button" onClick={onNotificationClick}>
              <img src="./../../bell.png" alt="通知" className="notification-icon" />
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>

            {showPopup && (
              <div className="notification-popup" ref={popupRef}>
                <div className="tabs">
                  <button
                    onClick={() => setActiveTab("personal")}
                    className={activeTab === "personal" ? "active" : ""}
                  >
                    {t.personal}
                  </button>
                  <button
                    onClick={() => setActiveTab("global")}
                    className={activeTab === "global" ? "active" : ""}
                  >
                    {t.global}
                  </button>
                </div>

                <div
                  className="notifications-list"
                  onClick={(e) => {
                    // 通知内リンククリック時の親ハンドラ発火を抑止
                    const target = e.target;
                    if (target && target.closest && target.closest("a")) e.stopPropagation();
                  }}
                >
                  {/* 個人通知 */}
                  {activeTab === "personal" ? (
                    notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`notification-item ${
                            notification.is_read ? "read" : "unread"
                          }`}
                          onClick={() => onNotificationMove(notification)}
                        >
                          <div className="notification-message">
                            <RichText content={notification.message} />
                          </div>
                          <span className="time">
                            {new Date(notification.time).toLocaleString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p>{t.noNotifications}</p>
                    )
                  ) : // 全体通知
                  globalNotifications.length > 0 ? (
                    globalNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`notification-item ${
                          Array.isArray(notification.read_users) &&
                          notification.read_users.includes(userId)
                            ? "read"
                            : "unread"
                        }`}
                        onClick={() => onGlobalNotificationMove(notification)}
                      >
                        <div className="notification-message">
                          <RichText content={notification.message} />
                        </div>
                        <span className="time">
                          {new Date(notification.time).toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p>{t.noNotifications}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="userIcon">{user ? `${user.nickname} ` : t.guest}</div>
        </div>
      </header>

      <div className="admin-question-list">
        <h1 className="admin-situmon-header">{`${categoryName}`}</h1>

        {questions.length > 0 ? (
          questions.map((question) => (
            <div
              className="admin-question-item"
              id={`admin-question-${question.question_id}`}
              key={question.question_id}
              style={{ cursor: "pointer" }}
            >
              <div
                className="admin-question-header"
                onClick={(e) => {
                  // ★ リンククリック時はトグルしない
                  const target = e.target;
                  if (target && target.closest && target.closest("a")) return;
                  toggleAnswer(question.question_id);
                }}
              >
                <div className="admin-question-headline">
                  <div className="admin-question-text">
                    <RichText content={question.質問} />
                  </div>
                  <div className="admin-question-meta">
                    <div className="admin-question-user">
                      {t.editor}: {question.editor_name || question.user_name || "—"}
                    </div>
                    <div className="admin-question-date">
                      {t.questionDate}
                      {new Date(question.time).toLocaleString()}
                    </div>
                  </div>
                </div>

                <button
                  className="change-category-button"
                  onClick={(e) => {
                    e.stopPropagation(); // 親の開閉とバッティングしない
                    openCategoryModal(question.question_id, question.category_id);
                  }}
                >
                  {t.changecategory}
                </button>
              </div>

              {/* 削除 */}
              <button className="delete-button" onClick={() => deleteQuestion(question.question_id)}>
                {t.delete}
              </button>

              {visibleAnswerId === question.question_id && (
                <div className="admin-answer-section">
                  <strong>{t.answer}</strong>

                  {editingAnswerId === question.question_id ? (
                    <textarea
                      className="admin-answer-textarea"
                      rows={12}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <p
                      className="admin-answer-text"
                      onClick={(e) => {
                        const target = e.target;
                        if (target && target.closest && target.closest("a")) e.stopPropagation();
                      }}
                    >
                      <RichText content={question.回答 || t.loading} />
                    </p>
                  )}

                  {editingAnswerId === question.question_id ? (
                    <div className="admin-edit-actions">
                      {(() => {
                        const unchanged = String(editText ?? "").trim() === String(question.回答 ?? "").trim();
                        return (
                          <>
                            <button
                              className="admin-save-button"
                              onClick={() =>
                                handleSaveEdit(question.answer_id, question.question_id)
                              }
                              disabled={isSaving || unchanged}
                              title={unchanged ? (t?.noChanges || '変更はありません') : ''}
                            >
                              {isSaving ? "保存中..." : t.save}
                            </button>
                            <button
                              className="admin-cancel-button"
                              onClick={() => handleEditClick(question.question_id)}
                              disabled={isSaving}
                            >
                              {t.cancel}
                            </button>
                          </>
                        );
                      })()}
                      <button
                        className="admin-history-button inline"
                        onClick={() => toggleHistory(question.answer_id)}
                        disabled={isSaving}
                      >
                        {historyOpenId === question.answer_id ? (t?.historyClose || '閉じる') : (t?.historyOpen || '過去の回答を見る')}
                      </button>
                    </div>
                  ) : (
                    <div className="admin-actions-row">
                      <button
                        className="admin-edit-button"
                        onClick={() =>
                          handleEditClick(
                            question.question_id,
                            question.answer_id,
                            question.回答
                          )
                        }
                      >
                        {t.edit}
                      </button>
                      <button
                        className="admin-history-button inline"
                        onClick={() => toggleHistory(question.answer_id)}
                      >
                        {historyOpenId === question.answer_id ? (t?.historyClose || '閉じる') : (t?.historyOpen || '過去の回答を見る')}
                      </button>
                    </div>
                  )}

                  {historyOpenId === question.answer_id && (
                    <div className="admin-history-list">
                      {(() => {
                        const historyKey = `${question.answer_id}:${language}`;
                        const list = historyMap[historyKey] || [];
                        return list.length === 0 ? (
                        <p className="admin-history-empty">{t?.historyEmpty || '履歴はありません。'}</p>
                      ) : (
                        <ul>
                          {list.map((h, i) => {
                            const localKey = `${question.answer_id}:${language}:${i}`;
                            const baseText = (i < (list.length - 1))
                              ? (list[i + 1].texts || '')
                              : (question.回答 || '');
                            return (
                            <li key={i} className="admin-history-item">
                              <div className="admin-history-meta">
                                <span className="admin-history-time">{fmtTime(h.edited_at)}</span>
                                {h.editor_name && <span className="admin-history-editor">by {h.editor_name}</span>}
                              </div>
                              <div className="admin-history-text"><RichText content={h.texts} /></div>
                              <div className="admin-history-diff-toggle">
                                <button
                                  className="admin-history-button"
                                  onClick={() => setHistoryDiffOpenMap(prev => ({ ...prev, [localKey]: !prev[localKey] }))}
                                >
                                  {historyDiffOpenMap[localKey] ? (t?.diffHide || '差分を隠す') : (t?.diffShow || '差分を表示')}
                                </button>
                              </div>
                              {historyDiffOpenMap[localKey] && (
                                <div className="admin-history-diff">
                                  <div className="admin-history-diff-caption">{t?.diffCaption || 'この版 → 次の版との差分'}</div>
                                  {renderDiff(h.texts || '', baseText)}
                                </div>
                              )}
                            </li>
                          )})}
                        </ul>
                      )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="admin-no-questions">{t.noQuestions}</p>
        )}

        {/* カテゴリ選択ポップアップ */}
        {isModalOpen && (
          <div className="category-modal">
            <div className="category-modal-content">
              <h2>{t.selectcategory}</h2>
              <div className="category-grid">
                {categoryList.map((category) => (
                  <button
                    key={category.id}
                    className={`category-option-button ${category.className}`}
                    onClick={() =>
                      handleChangeCategory(
                        category.id,
                        category.name[language] || category.name.ja
                      )
                    }
                    disabled={category.id === selectedCategoryId}
                  >
                    {category.name[language] || category.name.ja}
                  </button>
                ))}
              </div>
              <button className="modal-close-button" onClick={closeCategoryModal}>
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => navigate && navigate("/admin/QuestionAdmin")}
        className="admin-back-button"
      >
        {t.backButton}
      </button>
    </div>
  );
};

export default Q_List;
