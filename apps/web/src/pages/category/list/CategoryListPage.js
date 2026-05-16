/**
 * S05: カテゴリ一覧画面
 * - AppLayout の OutletContext から language/t を取得
 * - categories.js から categoryList/categoryColors を使用
 * - 質問管理画面の旧カテゴリグリッドを踏襲
 * - Admin 関連を除外
 */
import React, { useState, useEffect, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { categoryList, categoryColors } from "../../../config/categories";
import { fetchCategoryTranslation } from "../api";
import { toast } from "../../../features/common/toast";
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
} from "lucide-react";

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

function getTextColorForBg(hex) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return "#1f2937";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const srgb = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

export default function CategoryListPage() {
  const { language, t } = useOutletContext();
  const navigate = useNavigate();
  const [hoveredCategoryId, setHoveredCategoryId] = useState(null);
  const hasCheckedCategoryApiRef = useRef(false);

  // バックエンド停止時にカテゴリ取得失敗トーストを表示するための疎通チェック
  useEffect(() => {
    if (hasCheckedCategoryApiRef.current) return;
    hasCheckedCategoryApiRef.current = true;

    let cancelled = false;
    const sampleCategoryId = categoryList?.[0]?.id;
    if (!sampleCategoryId) return;

    async function verifyCategoryApi() {
      try {
        const resp = await fetchCategoryTranslation(sampleCategoryId);
        if (!resp.ok) throw new Error("category_api_unavailable");
      } catch (error) {
        console.error("カテゴリ一覧API疎通エラー:", error);
        if (!cancelled) {
          toast.error(t?.categoryError || "カテゴリの取得に失敗しました", {
            duration: 4000,
          });
        }
      }
    }

    verifyCategoryApi();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="flex justify-center">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-6 text-slate-800 md:py-8">
          <div className="w-full">
            <div className="mb-10 text-center">
              <div className="mb-4 flex items-center justify-center gap-3">
                <Layers className="h-8 w-8 text-blue-800" />
                <h1 className="text-3xl font-bold text-blue-800">{t.categorySearch}</h1>
              </div>
              <div className="mx-auto mb-4 h-1 w-20 rounded-full bg-blue-600" />
              <p className="text-sm text-slate-600 sm:text-base">
                {language === "ja" ? "カテゴリを選択してください" : t.selectcategory || t.select}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" role="list">
              {categoryList.map((cat) => {
                const palette = categoryColors[cat.className] || {
                  base: "#f4f4f4",
                  hover: "#e5e5e5",
                };
                const isHover = hoveredCategoryId === cat.id;
                const bg = isHover ? palette.hover : palette.base;
                const color = getTextColorForBg(bg);
                const Icon = categoryIcons[cat.className] || Tag;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="listitem"
                    aria-label={cat.name[language] || cat.name.ja}
                    onClick={() => navigate(`/category/${cat.id}`)}
                    onMouseEnter={() => setHoveredCategoryId(cat.id)}
                    onMouseLeave={() => setHoveredCategoryId(null)}
                    onFocus={() => setHoveredCategoryId(cat.id)}
                    onBlur={() => setHoveredCategoryId(null)}
                    className="group relative min-h-[136px] overflow-hidden rounded-lg border-0 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    style={{ backgroundColor: bg, color }}
                  >
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
                      <Icon className="h-7 w-7 opacity-90" />
                      <span className="text-sm font-bold leading-snug sm:text-base">
                        {cat.name[language] || cat.name.ja}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
