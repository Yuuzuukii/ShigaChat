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
import {
  IdCard,
  HeartHandshake,
  Stethoscope,
  PiggyBank,
  Briefcase,
  GraduationCap,
  Heart,
  Baby,
  Home,
  Receipt,
  HelpingHand,
  Siren,
  CloudLightning,
  Tag,
  Edit3,
  Trash2,
  FolderOpen,
  Archive,
  History,
  ArrowLeft,
  Layers,
} from "lucide-react";

// カテゴリアイコンのマッピング（Question_Adminと同じ）
const categoryIcons = {
  "category-zairyu": IdCard,
  "category-seikatsu": HeartHandshake,
  "category-iryo": Stethoscope,
  "category-nenkin": PiggyBank,
  "category-roudou": Briefcase,
  "category-kyouiku": GraduationCap,
  "category-kekkon": Heart,
  "category-shussan": Baby,
  "category-jutaku": Home,
  "category-zeikin": Receipt,
  "category-fukushi": HelpingHand,
  "category-jiken": Siren,
  "category-saigai": CloudLightning,
  "category-sonota": Tag,
};

// RichText moved to common component

const Q_List = () => {
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const targetQuestionId = Number(searchParams.get("id")) || null;

  // デバッグ用ログ
  console.log("Q_List - categoryId:", categoryId, "targetQuestionId:", targetQuestionId);

  // デバッグ用のスクロール関数をグローバルに追加
  useEffect(() => {
    window.debugScrollToQuestion = (questionId) => {
      const el = document.getElementById(`admin-question-${questionId}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const elementTop = rect.top + window.pageYOffset;
        const scrollPosition = Math.max(0, elementTop - 120);
        
        console.log("Debug scroll - questionId:", questionId, "scrollPosition:", scrollPosition);
        window.scrollTo({ top: scrollPosition, behavior: "smooth" });
        
        // ハイライト
        el.style.boxShadow = "0 0 20px rgba(255, 0, 0, 0.5)";
        el.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
        setTimeout(() => {
          el.style.boxShadow = "";
          el.style.backgroundColor = "";
        }, 2000);
      } else {
        console.log("Element not found:", `admin-question-${questionId}`);
      }
    };
    
    return () => {
      delete window.debugScrollToQuestion;
    };
  }, []);

  const [questions, setQuestions] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [visibleAnswerId, setVisibleAnswerId] = useState(null);
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem("shigachat_lang") || "ja"; } catch { return "ja"; }
  });
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

  // 同一タブ内の言語変更（NavBarなど）に即時追従
  useEffect(() => {
    const onLang = (e) => {
      const code = e?.detail?.code;
      if (code) setLanguage(code);
    };
    window.addEventListener("languageChanged", onLang);
    return () => window.removeEventListener("languageChanged", onLang);
  }, []);

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
    console.log("Scroll effect triggered - targetQuestionId:", targetQuestionId, "questions length:", questions?.length);
    
    if (!targetQuestionId || !questions || questions.length === 0) return;
    
    // 少し遅延してスクロール（DOM描画完了を待つ）
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`admin-question-${targetQuestionId}`);
      console.log("Looking for element with ID:", `admin-question-${targetQuestionId}`, "Found:", !!el);
      
      if (el) {
        // まず自動的に該当質問の回答を展開
        try { 
          setVisibleAnswerId(String(targetQuestionId)); 
          console.log("Set visible answer ID:", targetQuestionId);
        } catch (e) {
          console.warn("Failed to set visible answer ID:", e);
        }
        
        // 回答展開後にスクロール処理を実行（さらに遅延）
        setTimeout(() => {
          // 複数のスクロール方法を試行
          const rect = el.getBoundingClientRect();
          const elementTop = rect.top + window.pageYOffset;
          const offset = 120; // ヘッダー分のオフセット
          const scrollPosition = Math.max(0, elementTop - offset);
          
          console.log("Element position:", {
            elementTop,
            offset,
            scrollPosition,
            currentScroll: window.pageYOffset
          });
          
          // Method 1: window.scrollTo
          window.scrollTo({ 
            top: scrollPosition, 
            behavior: "smooth" 
          });
          
          // スクロール完了確認
          let scrollCheckCount = 0;
          const checkScroll = () => {
            scrollCheckCount++;
            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
            console.log(`Scroll check ${scrollCheckCount}: current=${currentScroll}, target=${scrollPosition}`);
            
            if (scrollCheckCount < 10 && Math.abs(currentScroll - scrollPosition) > 20) {
              setTimeout(checkScroll, 100);
            } else if (scrollCheckCount >= 10 && Math.abs(currentScroll - scrollPosition) > 50) {
              console.log("Force scrolling with scrollIntoView");
              el.scrollIntoView({ 
                behavior: "smooth", 
                block: "start",
                inline: "nearest"
              });
            }
          };
          setTimeout(checkScroll, 100);
          
          // Method 2: 1秒後にscrollIntoViewでフォールバック
          setTimeout(() => {
            const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const targetScrollTop = scrollPosition;
            
            // スクロールが正しく実行されていない場合のフォールバック
            if (Math.abs(currentScrollTop - targetScrollTop) > 50) {
              console.log("Fallback scrolling with scrollIntoView");
              el.scrollIntoView({ 
                behavior: "smooth", 
                block: "start",
                inline: "nearest"
              });
            }
          }, 1000);
          
          // ハイライト効果を追加
          el.style.transition = "all 0.3s ease";
          el.style.boxShadow = "0 0 20px rgba(59, 130, 246, 0.5)";
          el.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
          el.style.border = "2px solid rgba(59, 130, 246, 0.3)";
          
          // ハイライトを一定時間後に削除
          setTimeout(() => {
            el.style.boxShadow = "";
            el.style.backgroundColor = "";
            el.style.border = "";
          }, 4000);
          
        }, 200); // 回答展開後の遅延
        
      } else {
        console.warn(`Element with ID admin-question-${targetQuestionId} not found`);
        // 全ての質問要素のIDをログ出力してデバッグ
        const allQuestionElements = document.querySelectorAll('[id^="admin-question-"]');
        console.log("Available question IDs:", Array.from(allQuestionElements).map(el => el.id));
      }
    }, 500); // 初期遅延を増加
    
    return () => clearTimeout(scrollTimer);
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
        const targetAnswerId = Number(answerId);
        const isHistoryOpen = historyOpenId === targetAnswerId;
        
        if (isHistoryOpen) {
          const key = `${targetAnswerId}:${language}`;
          const res = await fetch(`${API_BASE_URL}/admin/answer_history?answer_id=${encodeURIComponent(targetAnswerId)}&lang=${encodeURIComponent(language)}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          if (res.ok) {
            const data = await res.json();
            setHistoryMap(prev => ({ ...prev, [key]: data.history || [] }));
          } else {
            // キャッシュを無効化して次回切り替え時に強制リロード
            setHistoryMap(prev => {
              const newMap = { ...prev };
              delete newMap[key];
              return newMap;
            });
          }
        }
      } catch (e) {
        console.warn('Failed to refresh history immediately:', e);
        // キャッシュをクリアして次回再読み込みを強制
        const targetAnswerId = Number(answerId);
        const key = `${targetAnswerId}:${language}`;
        setHistoryMap(prev => {
          const newMap = { ...prev };
          delete newMap[key];
          return newMap;
        });
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
    const targetAnswerId = Number(answerId);
    const isCurrentlyOpen = historyOpenId === targetAnswerId;
    
    setHistoryOpenId(prev => (prev === targetAnswerId ? null : targetAnswerId));
    
    if (!answerId || isCurrentlyOpen) return; // 閉じる場合は何もしない
    
    const key = `${targetAnswerId}:${language}`;
    if (historyMap[key] && historyMap[key].length > 0) return; // 既に読み込み済み
    
    try {
      const res = await fetch(`${API_BASE_URL}/admin/answer_history?answer_id=${encodeURIComponent(targetAnswerId)}&lang=${encodeURIComponent(language)}`, {
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

  const toggleAnswer = (questionId) => {
    if (!questionId) {
      console.error("質問IDが取得できません:", questionId);
      return;
    }
    const id = String(questionId);
    setVisibleAnswerId((prevId) => (String(prevId) === id ? null : id));
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
    <div className="w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="flex justify-center">
        <div 
          className={`relative z-10 w-full mx-auto max-w-4xl px-4 py-6 text-zinc-800 transition-opacity duration-500 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="w-full">
            {/* カテゴリタイトル */}
            <div className="mb-8 text-center">
              {(() => {
                const currentCategory = categoryList.find(cat => cat.id === parseInt(categoryId));
                const CategoryIcon = currentCategory ? categoryIcons[currentCategory.className] : Tag;
                return (
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <CategoryIcon className="w-8 h-8 text-blue-800" />
                    <h1 className="text-3xl font-bold text-blue-800">{`${categoryName} `}</h1>
                  </div>
                );
              })()}
              <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full"></div>
            </div>

            {questions.length > 0 ? (
              <div className="w-full space-y-6 mb-20">
                {questions.map((question) => (
                  <div
                    key={question.question_id}
                    id={`admin-question-${question.question_id}`}
                    className="cursor-pointer rounded-lg bg-zinc-50 p-6 transition-all duration-200 hover:bg-blue-50/50 hover:shadow-sm min-h-[120px]"
                  >
                    <div
                      className="w-full"
                      onClick={(e) => {
                        const target = e.target;
                        if (target && target.closest && target.closest("button")) return;
                        if (target && target.closest && target.closest("a")) return;
                        toggleAnswer(question.question_id);
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 text-lg font-semibold text-zinc-900 min-w-0 flex-1">
                          <svg className="h-5 w-5 text-zinc-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="flex-1 min-w-0 leading-relaxed">
                            <RichText content={question.質問} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCategoryModal(question.question_id, question.category_id);
                            }}
                          >
                            <Layers className="w-4 h-4" />
                            {t.changecategory || "カテゴリ変更"}
                          </button>
                          <button
                            className="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteQuestion(question.question_id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                            {t.delete || "削除"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-1 text-sm text-zinc-500">
                        <div className="flex items-center gap-4">
                          <span>
                            編集者: {question.editor_name || question.user_name || "—"}
                          </span>
                          <div className="flex items-center gap-1">
                            <svg className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>
                              投稿日: {new Date((question.last_edited_at || question.time).replace(' ', 'T')).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                {String(visibleAnswerId) === String(question.question_id) && (
                  <div className="mt-4 rounded-md bg-blue-50/50 p-4 text-zinc-800">
                    <div className="text-sm font-semibold text-zinc-700 mb-3">{t.answer || "回答"}</div>
                    
                    {editingAnswerId === question.question_id ? (
                      <textarea
                        className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[200px] text-base leading-8"
                        rows={12}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="回答を入力してください..."
                        autoFocus
                      />
                    ) : (
                      <div
                        className="text-base leading-8 whitespace-pre-wrap break-words"
                        onClick={(e) => {
                          const target = e.target;
                          if (target && target.closest && target.closest("a")) e.stopPropagation();
                        }}
                      >
                        <RichText content={question.回答 || "読み込み中..."} />
                      </div>
                    )}

                    {/* 編集・保存・履歴ボタン */}
                    {editingAnswerId === question.question_id ? (
                      <div className="flex flex-wrap gap-2 mt-6">
                        {(() => {
                          const unchanged = String(editText ?? "").trim() === String(question.回答 ?? "").trim();
                          return (
                            <>
                              <button
                                className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 ${
                                  isSaving || unchanged
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-green-500 text-white hover:bg-green-600'
                                }`}
                                onClick={() => handleSaveEdit(question.answer_id, question.question_id)}
                                disabled={isSaving || unchanged}
                                title={unchanged ? '変更はありません' : ''}
                              >
                                <Archive className="w-4 h-4" />
                                {isSaving ? "保存中..." : "保存"}
                              </button>
                              <button
                                className={`px-4 py-2 bg-gray-500 text-white rounded-md font-medium transition-colors flex items-center gap-2 ${
                                  isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'
                                }`}
                                onClick={() => handleEditClick(question.question_id)}
                                disabled={isSaving}
                              >
                                <ArrowLeft className="w-4 h-4" />
                                キャンセル
                              </button>
                            </>
                          );
                        })()}
                        <button
                          className={`px-4 py-2 bg-purple-500 text-white rounded-md font-medium transition-colors flex items-center gap-2 ${
                            isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-600'
                          }`}
                          onClick={() => toggleHistory(question.answer_id)}
                          disabled={isSaving}
                        >
                          <History className="w-4 h-4" />
                          {historyOpenId === question.answer_id ? '履歴を閉じる' : '過去の回答を見る'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-6">
                        <button
                          className="px-4 py-2 bg-blue-500 text-white rounded-md font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
                          onClick={() => handleEditClick(question.question_id, question.answer_id, question.回答)}
                        >
                          <Edit3 className="w-4 h-4" />
                          編集
                        </button>
                        <button
                          className="px-4 py-2 bg-purple-500 text-white rounded-md font-medium hover:bg-purple-600 transition-colors flex items-center gap-2"
                          onClick={() => toggleHistory(question.answer_id)}
                        >
                          <History className="w-4 h-4" />
                          {historyOpenId === question.answer_id ? '履歴を閉じる' : '過去の回答を見る'}
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
            ))}              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">📝</div>
                <p className="text-xl text-gray-500 mb-2">{t.noQuestions || "質問がありません"}</p>
                <p className="text-gray-400">{t.noQuestionsRegisteredInCategory || t.noQuestions || "このカテゴリには質問が登録されていません。"}</p>
              </div>
            )}
          </div>

          {/* 戻るボタン */}
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
            <button 
              onClick={() => navigate && navigate("/admin/QuestionAdmin")}
              className="px-8 py-4 bg-blue-600 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-xl font-medium flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              {t.backButton || "戻る"}
            </button>
          </div>
        </div>
      </div>

      {/* カテゴリ選択モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t.selectcategory || "カテゴリを選択"}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {categoryList.map((category) => {
                const CategoryIcon = categoryIcons[category.className] || Tag;
                return (
                  <button
                    key={category.id}
                    className={`p-3 rounded-lg border-2 font-medium transition-all duration-200 flex items-center gap-2 ${
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
                    <CategoryIcon className="w-5 h-5 text-gray-600" />
                    {category.name[language] || category.name.ja}
                  </button>
                );
              })}
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
