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
// Migrated to Tailwind CSS
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
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState("personal");
  const [isSaving, setIsSaving] = useState(false);
  const [isNotifLoading, setIsNotifLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const popupRef = useRef(null);

  const { user, setUser, token, setToken, fetchUser } = useContext(UserContext);
  const t = translations[language];

  // マウント時のフェードイン効果
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

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
    if (user === null && navigate && isDataLoaded) {
      // データロード後でuserがnullの場合のみリダイレクト
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
  }, [user, navigate, fetchUser, isDataLoaded]);

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
  }, [showPopup, popupRef]);

  // 質問の取得
  useEffect(() => {
    const loadData = async () => {
      if (user && token) {
        setIsLoading(true);
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
        } catch (error) {
          console.error("データ取得エラー:", error);
        } finally {
          setIsLoading(false);
          setIsDataLoaded(true);
        }
      } else if (user === false || token === false) {
        // ユーザーまたはトークンが明示的にfalseの場合、認証エラー
        setIsDataLoaded(true);
      }
    };

    loadData();
  }, [categoryId, language, user, token, t]);

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

  const handleLanguageChange = async (event) => {
    const newLanguage = event.target.value;
    await updateUserLanguage(newLanguage, setUser, setToken);
    setLanguage(newLanguage);
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

  // マウント時のフェードイン効果と初期認証チェック
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    
    // 初期認証チェック
    const initializeAuth = () => {
      const storedToken = localStorage.getItem("token");
      const storedUser = localStorage.getItem("user");
      
      if (!storedToken || !storedUser) {
        setIsDataLoaded(true); // 認証情報がない場合は即座にloaded状態にする
      }
    };
    
    initializeAuth();
    return () => cancelAnimationFrame(r);
  }, []);

  if (!navigate) {
    console.error("navigate is not initialized");
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">Loading...</div>
    </div>;
  }
  
  // データロード中または認証チェック中
  if (!isDataLoaded || isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">
        {isLoading ? "データを読み込み中..." : "Loading..."}
      </div>
    </div>;
  }

  // 認証失敗時
  if (!user || !token) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">認証が必要です...</div>
    </div>;
  }

  return (
    <div className={`relative z-0 min-h-[calc(100vh-5rem)] bg-white text-slate-800 transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* 質問の削除確認モーダルなど、既存の機能を保持 */}
      
      <div className="container mx-auto px-4 py-6 admin-question-history-container">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">{`${categoryName} の質問管理`}</h1>
          <p className="text-gray-600">質問の編集・削除・カテゴリ変更を行うことができます。</p>
        </div>

        {questions.length > 0 ? (
          <div className="space-y-4">
            {questions.map((question) => (
              <div
                key={question.question_id}
                id={`admin-question-${question.question_id}`}
                className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div
                  className="p-6 cursor-pointer border-b border-gray-100"
                  onClick={(e) => {
                    const target = e.target;
                    if (target && target.closest && target.closest("a")) return;
                    toggleAnswer(question.question_id);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="prose max-w-none mb-3">
                        <div className="text-lg font-medium text-gray-800">
                          <RichText content={question.質問} />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <span>
                          編集者: {question.editor_name || question.user_name || "—"}
                        </span>
                        <span>
                          投稿日: {new Date((question.last_edited_at || question.time).replace(' ', 'T')).toLocaleString()}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          question.public 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {question.public ? '公開中' : '非公開'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCategoryModal(question.question_id, question.category_id);
                        }}
                      >
                        カテゴリ変更
                      </button>
                      <button
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteQuestion(question.question_id);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>

                {visibleAnswerId === question.question_id && (
                  <div className="p-6 bg-gray-50">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3">回答</h3>
                      
                      {editingAnswerId === question.question_id ? (
                        <textarea
                          className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[200px]"
                          rows={12}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          placeholder="回答を入力してください..."
                          autoFocus
                        />
                      ) : (
                        <div
                          className="bg-white p-4 rounded-lg border border-gray-200 prose max-w-none"
                          onClick={(e) => {
                            const target = e.target;
                            if (target && target.closest && target.closest("a")) e.stopPropagation();
                          }}
                        >
                          <RichText content={question.回答 || "読み込み中..."} />
                        </div>
                      )}
                    </div>

                    {/* 編集・保存・履歴ボタン */}
                    {editingAnswerId === question.question_id ? (
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const unchanged = String(editText ?? "").trim() === String(question.回答 ?? "").trim();
                          return (
                            <>
                              <button
                                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                                  isSaving || unchanged
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-green-500 text-white hover:bg-green-600'
                                }`}
                                onClick={() => handleSaveEdit(question.answer_id, question.question_id)}
                                disabled={isSaving || unchanged}
                                title={unchanged ? '変更はありません' : ''}
                              >
                                {isSaving ? "保存中..." : "保存"}
                              </button>
                              <button
                                className={`px-4 py-2 bg-gray-500 text-white rounded-md font-medium transition-colors ${
                                  isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'
                                }`}
                                onClick={() => handleEditClick(question.question_id)}
                                disabled={isSaving}
                              >
                                キャンセル
                              </button>
                            </>
                          );
                        })()}
                        <button
                          className={`px-4 py-2 bg-purple-500 text-white rounded-md font-medium transition-colors ${
                            isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-600'
                          }`}
                          onClick={() => toggleHistory(question.answer_id)}
                          disabled={isSaving}
                        >
                          {historyOpenId === question.answer_id ? '履歴を閉じる' : '過去の回答を見る'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="px-4 py-2 bg-blue-500 text-white rounded-md font-medium hover:bg-blue-600 transition-colors"
                          onClick={() => handleEditClick(question.question_id, question.answer_id, question.回答)}
                        >
                          編集
                        </button>
                        <button
                          className="px-4 py-2 bg-purple-500 text-white rounded-md font-medium hover:bg-purple-600 transition-colors"
                          onClick={() => toggleHistory(question.answer_id)}
                        >
                          {historyOpenId === question.answer_id ? '履歴を閉じる' : '過去の回答を見る'}
                        </button>
                        <button
                          className={`px-4 py-2 rounded-md font-medium transition-colors ${
                            question.public
                              ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                              : 'bg-green-500 text-white hover:bg-green-600'
                          }`}
                          onClick={() => togglePublicStatus(question.question_id, question.public)}
                        >
                          {question.public ? '非公開にする' : '公開する'}
                        </button>
                      </div>
                    )}

                    {/* 履歴表示 */}
                    {historyOpenId === question.answer_id && (
                      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="font-semibold text-gray-800 mb-3">編集履歴</h4>
                        {(() => {
                          const historyKey = `${question.answer_id}:${language}`;
                          const list = historyMap[historyKey] || [];
                          return list.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">履歴はありません。</p>
                          ) : (
                            <div className="space-y-4">
                              {list.map((h, i) => {
                                const localKey = `${question.answer_id}:${language}:${i}`;
                                const baseText = (i < (list.length - 1))
                                  ? (list[i + 1].texts || '')
                                  : (question.回答 || '');
                                return (
                                  <div key={i} className="border border-gray-100 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-4 text-sm text-gray-500">
                                        <span>{fmtTime(h.edited_at)}</span>
                                        {h.editor_name && <span>編集者: {h.editor_name}</span>}
                                      </div>
                                      <button
                                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                                        onClick={() => setHistoryDiffOpenMap(prev => ({ ...prev, [localKey]: !prev[localKey] }))}
                                      >
                                        {historyDiffOpenMap[localKey] ? '差分を隠す' : '差分を表示'}
                                      </button>
                                    </div>
                                    <div className="prose max-w-none text-sm">
                                      <RichText content={h.texts} />
                                    </div>
                                    {historyDiffOpenMap[localKey] && (
                                      <div className="mt-3 border-t border-gray-100 pt-3">
                                        <div className="text-xs text-gray-500 mb-2">この版 → 次の版との差分</div>
                                        <div className="diff-block">
                                          {diffLines(h.texts || '', baseText).map((p, idx) => (
                                            <div key={idx} className={`text-sm font-mono ${
                                              p.type === 'del' ? 'bg-red-100 text-red-700' :
                                              p.type === 'add' ? 'bg-green-100 text-green-700' :
                                              'bg-gray-50 text-gray-600'
                                            } px-2 py-1 border-l-2 ${
                                              p.type === 'del' ? 'border-red-400' :
                                              p.type === 'add' ? 'border-green-400' :
                                              'border-gray-300'
                                            }`}>
                                              {p.text || '\u00A0'}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )})}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📝</div>
            <p className="text-xl text-gray-500 mb-2">{t.noQuestions || "質問がありません"}</p>
            <p className="text-gray-400">このカテゴリには質問が登録されていません。</p>
          </div>
        )}

        {/* カテゴリ選択モーダル */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-gray-800 mb-4">{t.selectcategory || "カテゴリを選択"}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                {categoryList.map((category) => (
                  <button
                    key={category.id}
                    className={`p-3 rounded-lg border-2 font-medium transition-all duration-200 ${
                      category.id === selectedCategoryId
                        ? 'border-gray-400 bg-gray-100 cursor-not-allowed opacity-50'
                        : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                    }`}
                    style={{
                      backgroundColor: category.id === selectedCategoryId ? '#f3f4f6' : '#ffffff',
                    }}
                    onClick={() => handleChangeCategory(category.id, category.name[language] || category.name.ja)}
                    disabled={category.id === selectedCategoryId}
                  >
                    {category.name[language] || category.name.ja}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                  onClick={closeCategoryModal}
                >
                  {t.cancel || "キャンセル"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 戻るボタン */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate && navigate("/admin/QuestionAdmin")}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t.backButton || "戻る"}
          </button>
        </div>
      </div>

      {/* エラーメッセージ */}
      {errorMessage && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default Q_List;
