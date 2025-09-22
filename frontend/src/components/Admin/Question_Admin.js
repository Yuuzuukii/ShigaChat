// src/components/Admin/Question_Admin.jsx
import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { redirectToLogin } from "../../utils/auth";
import { UserContext } from "../../UserContext";
import {
  API_BASE_URL,
  translations,
  languageLabelToCode,
  categoryList,
} from "../../config/constants";
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
  Layers,
  Wrench,
  Plus,
} from "lucide-react";

// カテゴリアイコンのマッピング
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

// カテゴリ色のマッピング
const categoryColors = {
  "category-zairyu": { base: "#ffe599", hover: "#ffd966" },
  "category-seikatsu": { base: "#d9ead3", hover: "#b6d7a8" },
  "category-iryo": { base: "#f9cb9c", hover: "#f6b26b" },
  "category-nenkin": { base: "#c9daf8", hover: "#6d9eeb" },
  "category-roudou": { base: "#f6d7b0", hover: "#f4b183" },
  "category-kyouiku": { base: "#e06666", hover: "#cc0000" },
  "category-kekkon": { base: "#a4c2f4", hover: "#6fa8dc" },
  "category-shussan": { base: "#d9d2e9", hover: "#b4a7d6" },
  "category-jutaku": { base: "#b6d7a8", hover: "#93c47d" },
  "category-zeikin": { base: "#cfe2f3", hover: "#76a5af" },
  "category-fukushi": { base: "#f6e0b5", hover: "#e69138" },
  "category-jiken": { base: "#ea9999", hover: "#cc0000" },
  "category-saigai": { base: "#b4a7d6", hover: "#674ea7" },
  "category-sonota": { base: "#f3cda8", hover: "#e69138" },
};

// 背景色に応じたテキスト色を決定する関数
function getTextColorForBg(hex) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return "#1f2937";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const srgb = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

const Question_Admin = () => {
  const navigate = useNavigate();
  const { user, token, fetchUser } = useContext(UserContext);

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [title, setTitle] = useState("official"); // "official" | "unofficial"

  const [content, setContent] = useState("");
  const [answerText, setAnswerText] = useState("");

  const [language, setLanguage] = useState("ja");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  const t = translations[language] || translations.ja;

  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  useEffect(() => {
    if (user?.spokenLanguage) {
      const code = languageLabelToCode[user.spokenLanguage];
      setLanguage(code || "ja");
    }
  }, [user]);

  useEffect(() => {
    if (user === null) redirectToLogin(navigate);
    const handleTokenUpdate = () => {
      const latestToken = localStorage.getItem("token");
      if (latestToken) fetchUser(latestToken);
    };
    window.addEventListener("tokenUpdated", handleTokenUpdate);
    return () => window.removeEventListener("tokenUpdated", handleTokenUpdate);
  }, [user, navigate, fetchUser]);

  const handleCategoryClick = (id) => {
    navigate(`/admin/category/${id}`);
  };

  const openCategoryModal = () => setIsCategoryModalOpen(true);
  const closeCategoryModal = () => setIsCategoryModalOpen(false);
  const openRegisterModal = () => setIsRegisterModalOpen(true);
  const closeRegisterModal = () => setIsRegisterModalOpen(false);

  const handleChangeCategory = (id, name) => {
    setSelectedCategoryId(id);
    setSelectedCategoryName(name);
    closeCategoryModal();
  };

  const clearForm = () => {
    setContent("");
    setAnswerText("");
    setSelectedCategoryId(null);
    setSelectedCategoryName("");
    setTitle("official");
  };

  // 登録ボタンの活性状態を判定
  const isFormValid = selectedCategoryId && content.trim() && answerText.trim();

  const handleRegisterQuestion = async () => {
    if (!content.trim()) return setErrorMessage(t.questionerror);
    if (!answerText.trim()) return setErrorMessage(t.answererror);
    if (!selectedCategoryId) return setErrorMessage(t.selectcategory);

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/admin/register_question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category_id: selectedCategoryId,
          title: title === "official" ? "official" : "ユーザー質問",
          content,
          answer_text: answerText,
          public: true, // ← トグル削除に伴い常に公開（不要ならこの行を消す）
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "QA登録に失敗しました。");
      }

      alert(t.register);
      clearForm();
      setIsRegisterModalOpen(false);
    } catch (e) {
      console.error("QA登録エラー:", e);
      setErrorMessage(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const userData = localStorage.getItem("user");
  const localUserId = userData ? JSON.parse(userData).id : null;

  return (
    <div className="w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="flex justify-center">
        <div 
          className={`relative z-10 w-full mx-auto max-w-6xl px-4 py-6 text-zinc-800 transition-opacity duration-500 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="w-full">
            {/* ページタイトル */}
            <div className="mb-10 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Wrench className="w-8 h-8 text-blue-800" />
                <h1 className="text-3xl font-bold text-blue-800">{t.questionmanagement}</h1>
              </div>
              <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full mb-4"></div>
              <p className="text-gray-600">質問の編集・削除・カテゴリ変更を行うことができます</p>
            </div>
            

            {/* 質問登録ボタン - 上部に移動 */}
            <div className="flex justify-center mb-8">
              <button 
                onClick={openRegisterModal} 
                disabled={isSubmitting}
                className="px-8 py-4 bg-blue-600 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-xl font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
                {t.registerquestion}
              </button>
            </div>

            {/* カテゴリグリッド */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categoryList.map((category) => {
                const Icon = categoryIcons[category.className] || Tag;
                const palette = categoryColors[category.className] || { base: "#f4f4f4", hover: "#e5e5e5" };
                const textColor = getTextColorForBg(palette.base);
                const hoverTextColor = getTextColorForBg(palette.hover);
                
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryClick(category.id)}
                    className="group relative overflow-hidden rounded-lg p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-105 border-0"
                    style={{ 
                      '--bg-base': palette.base,
                      '--bg-hover': palette.hover,
                      '--text-base': textColor,
                      '--text-hover': hoverTextColor,
                      backgroundColor: 'var(--bg-base)',
                      color: 'var(--text-base)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                      e.currentTarget.style.color = 'var(--text-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-base)';
                      e.currentTarget.style.color = 'var(--text-base)';
                    }}
                  >
                    <div className="flex flex-col items-center text-center">
                      {/* カテゴリアイコン */}
                      <div className="flex items-center justify-center w-12 h-12 mb-2 rounded-full bg-white bg-opacity-40 transition-all duration-300">
                        <Icon className="w-6 h-6 opacity-90 transition-all duration-300" />
                      </div>
                      
                      {/* カテゴリ名 */}
                      <h3 className="text-sm font-semibold leading-tight transition-colors duration-300">
                        {category.name[language] || category.name.ja}
                      </h3>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 質問登録モーダル */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col">
            {/* モーダルヘッダー */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white">{t.register_question}</h2>
                </div>
                <button 
                  onClick={closeRegisterModal}
                  className="w-8 h-8 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 flex items-center justify-center text-white transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 rounded-r-lg">
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-red-700 text-sm font-medium">{errorMessage}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* カテゴリ選択 */}
                <div className="group">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
                    <Layers className="w-4 h-4 text-blue-600" />
                    {t.category}
                    <span className="text-red-500 text-xs">*必須</span>
                  </label>
                  
                  {/* 選択済みカテゴリの表示 */}
                  {selectedCategoryId && selectedCategoryName && (
                    <div className="mb-4">
                      {(() => {
                        const selectedCategory = categoryList.find(cat => cat.id === selectedCategoryId);
                        if (!selectedCategory) return null;
                        
                        const Icon = categoryIcons[selectedCategory.className] || Tag;
                        const palette = categoryColors[selectedCategory.className] || { base: "#f4f4f4", hover: "#e5e5e5" };
                        const textColor = getTextColorForBg(palette.base);
                        
                        return (
                          <div 
                            className="inline-flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-sm border border-opacity-20"
                            style={{ 
                              backgroundColor: palette.base,
                              color: textColor,
                              borderColor: palette.hover
                            }}
                          >
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white bg-opacity-50">
                              <Icon className="w-4 h-4 opacity-90" />
                            </div>
                            <span className="font-semibold">{selectedCategoryName}</span>
                            <button
                              onClick={() => {
                                setSelectedCategoryId(null);
                                setSelectedCategoryName("");
                              }}
                              className="ml-2 w-5 h-5 rounded-full bg-white bg-opacity-60 hover:bg-opacity-80 flex items-center justify-center transition-all duration-200 hover:scale-110"
                              title="選択解除"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* カテゴリ選択ボタン */}
                  <button 
                    onClick={openCategoryModal} 
                    disabled={isSubmitting}
                    className={`w-full px-6 py-4 border-2 border-dashed rounded-xl text-left transition-all duration-200 disabled:opacity-50 ${
                      selectedCategoryId 
                        ? "border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700" 
                        : "border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 text-gray-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="w-5 h-5" />
                      <span className="font-medium">
                        {selectedCategoryId ? "カテゴリを変更する" : t.selectcategory}
                      </span>
                    </div>
                  </button>
                </div>

                {/* 質問テキスト */}
                <div className="group">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t.qtext}
                    <span className="text-red-500 text-xs">*必須</span>
                  </label>
                  <div className="relative">
                    <textarea 
                      value={content} 
                      onChange={(e) => setContent(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical transition-all duration-200 placeholder-gray-400"
                      placeholder="質問内容を入力してください..."
                    />
                    <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                      {content.length} 文字
                    </div>
                  </div>
                </div>

                {/* 回答テキスト */}
                <div className="group">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {t.answer}
                    <span className="text-red-500 text-xs">*必須</span>
                  </label>
                  <div className="relative">
                    <textarea 
                      value={answerText} 
                      onChange={(e) => setAnswerText(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical transition-all duration-200 placeholder-gray-400"
                      placeholder="回答内容を入力してください..."
                    />
                    <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                      {answerText.length} 文字
                    </div>
                  </div>
                </div>
              </div>

              {/* ボタン */}
              <div className="flex gap-4 justify-end mt-6 pt-4 border-t border-gray-100">
                <button 
                  onClick={closeRegisterModal} 
                  disabled={isSubmitting}
                  className="px-8 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all duration-200 disabled:opacity-50 font-medium"
                >
                  {t.close || "キャンセル"}
                </button>
                <button 
                  onClick={handleRegisterQuestion} 
                  disabled={isSubmitting || !isFormValid}
                  className={`px-8 py-3 rounded-xl font-medium flex items-center gap-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isFormValid && !isSubmitting
                      ? "bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl transform hover:scale-105"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      登録中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t.register_question}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* カテゴリ選択モーダル */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">{t.selectcategory}</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                {categoryList.map((category) => {
                  const Icon = categoryIcons[category.className] || Tag;
                  const palette = categoryColors[category.className] || { base: "#f4f4f4", hover: "#e5e5e5" };
                  const isSelected = category.id === selectedCategoryId;
                  const bgColor = isSelected ? palette.hover : palette.base;
                  const textColor = getTextColorForBg(bgColor);
                  const hoverTextColor = getTextColorForBg(palette.hover);
                  
                  return (
                    <button
                      key={category.id}
                      onClick={() =>
                        handleChangeCategory(category.id, category.name[language] || category.name.ja)
                      }
                      disabled={isSelected}
                      className="group relative overflow-hidden rounded-lg p-3 transition-all duration-200 hover:shadow-md disabled:cursor-not-allowed border-0"
                      style={{ 
                        '--bg-base': palette.base,
                        '--bg-hover': palette.hover,
                        '--text-base': getTextColorForBg(palette.base),
                        '--text-hover': hoverTextColor,
                        backgroundColor: bgColor,
                        color: textColor,
                        outline: isSelected ? `2px solid ${palette.hover}` : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                          e.currentTarget.style.color = 'var(--text-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-base)';
                          e.currentTarget.style.color = 'var(--text-base)';
                        }
                      }}
                    >
                      <div className="flex flex-col items-center text-center">
                        <div className="flex items-center justify-center w-10 h-10 mb-2 rounded-full bg-white bg-opacity-40 transition-all duration-200">
                          <Icon className="w-5 h-5 opacity-90 transition-colors duration-200" />
                        </div>
                        <span className="text-xs font-medium leading-tight transition-colors duration-200">
                          {category.name[language] || category.name.ja}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1">
                          <div className="w-5 h-5 bg-white bg-opacity-80 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <button 
                  onClick={closeCategoryModal}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200"
                >
                  {t.close || "Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Question_Admin;
