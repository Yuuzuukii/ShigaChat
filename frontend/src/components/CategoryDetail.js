import React, { useEffect, useState, useContext } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { UserContext } from "../UserContext";
import {
    API_BASE_URL,
    translations,
    languageLabelToCode,
    categoryList,
} from "../config/constants";
import { redirectToLogin } from "../utils/auth";
import RichText from "./common/RichText";
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
  ArrowLeft
} from "lucide-react";

// カテゴリアイコンのマッピング（Q_List.jsと同じ）
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

function CategoryDetail() {
    const { categoryId } = useParams();
    const [questions, setQuestions] = useState(null);
    const [categoryName, setCategoryName] = useState("");
    const [visibleAnswerId, setVisibleAnswerId] = useState(null);
    const [language, setLanguage] = useState("ja");
    const [mounted, setMounted] = useState(false);
    const navigate = useNavigate();
    const { user, token, fetchUser } = useContext(UserContext);
    const [searchParams] = useSearchParams();
    const questionId = searchParams.get("id");

    const t = translations[language];

    useEffect(() => {
        const r = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(r);
    }, []);

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
        if (user === null) {
            redirectToLogin(navigate);
        }
        const handleTokenUpdate = () => {
            const latestToken = localStorage.getItem("token");
            if (latestToken) {
                fetchUser(latestToken);
            }
        };
        window.addEventListener("tokenUpdated", handleTokenUpdate);
        return () => {
            window.removeEventListener("tokenUpdated", handleTokenUpdate);
        };
    }, [user, navigate, fetchUser]);

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

    const fetchQuestions = async (categoryId, user, token, t, setLanguage, setCategoryName, setQuestions, navigate) => {
        if (!token || !user) {
            console.error("ユーザー情報またはトークンがありません。");
            redirectToLogin(navigate);
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
            console.log("📊 カテゴリデータ:", categoryData);
            console.log("📊 カテゴリ名の型:", typeof categoryData["カテゴリ名"]);
            console.log("📊 カテゴリ名の値:", categoryData["カテゴリ名"]);
            
            // カテゴリ名がオブジェクトの場合はdescriptionを取り出す
            const categoryNameValue = categoryData["カテゴリ名"];
            const categoryNameText = typeof categoryNameValue === 'object' && categoryNameValue !== null
                ? (categoryNameValue.description || JSON.stringify(categoryNameValue))
                : (categoryNameValue || t.categorynotfound);
            
            setCategoryName(categoryNameText);

            const response = await fetch(`${API_BASE_URL}/category/category/${categoryId}?lang=${lang}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.status === 401) {
                console.warn("トークンが期限切れです。ログインページへ移動します。");
                redirectToLogin(navigate);
                return;
            }

            if (!response.ok) {
                throw new Error("サーバーからデータを取得できませんでした");
            }

            const data = await response.json();
            console.log("📊 取得したデータ:", data);
            console.log("📊 質問データ:", data.questions);
            if (data.questions && data.questions.length > 0) {
                console.log("📊 最初の質問:", data.questions[0]);
                console.log("📊 質問フィールドの型:", typeof data.questions[0].質問);
                console.log("📊 回答フィールドの型:", typeof data.questions[0].回答);
            }
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

    if (questions === null) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50">
                <div className="text-lg text-gray-500">{t.loading}</div>
            </div>
        );
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
                                        <h1 className="text-3xl font-bold text-blue-800">{categoryName}</h1>
                                    </div>
                                );
                            })()}
                            <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full"></div>
                        </div>

                        {/* 質問リスト */}
                        <div className="w-full space-y-6 mb-20">
                        {questions.length > 0 ? (
                            <div className="space-y-6">
                                {questions.map((question) => {
                                    console.log("🔍 レンダリング中の質問:", question.question_id, typeof question.質問, question.質問);
                                    return (
                                    <div
                                        key={question.question_id}
                                        id={`question-${question.question_id}`}
                                        onClick={() => toggleAnswer(question.question_id)}
                                        className="cursor-pointer rounded-lg bg-zinc-50 p-6 transition-all duration-200 hover:bg-blue-50/50 hover:shadow-sm min-h-[120px]"
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
                                                {question?.title === "official" && (
                                                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                                        {t.official}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-3 flex items-center justify-end gap-1 text-sm text-zinc-500">
                                            <svg className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span>
                                                {t.questionDate}
                                                {new Date(question.time).toLocaleString()}
                                            </span>
                                        </div>

                                        {visibleAnswerId === question.question_id && (
                                            <div className="mt-4 rounded-md bg-blue-50/50 p-4 text-zinc-800">
                                                <div className="text-sm font-semibold text-zinc-700 mb-2">{t.answer}</div>
                                                <div className="text-base leading-8 whitespace-pre-wrap break-words">
                                                    <RichText content={question.回答 || t.loading} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-center text-sm text-zinc-500">{t.noQuestions}</p>
                        )}
                    </div>

                    {/* 戻るボタン */}
                    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
                        <button 
                            onClick={() => navigate(-1)} 
                            className="px-8 py-4 bg-blue-600 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-xl font-medium flex items-center gap-2"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            {t.backButton}
                        </button>
                    </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CategoryDetail;
