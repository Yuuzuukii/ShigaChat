/**
 * S05: カテゴリ一覧画面
 * - AppLayout の OutletContext から language/t を取得
 * - categories.js から categoryList/categoryColors を使用
 * - 円形レイアウト CSS (Category.css) を維持
 * - Admin 関連を除外
 */
import React, { useState, useEffect, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { categoryList, categoryColors } from "../config/categories";
import { fetchCategoryTranslation } from "../services/api";
import { toast } from "../lib/utils";
import { Button } from "../components/ui/button";
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
import "../components/Category.css";

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
  const ringRef = useRef(null);
  const hasCheckedCategoryApiRef = useRef(false);

  // CSS @property(--spin) 非対応時のフォールバック
  useEffect(() => {
    const el = ringRef.current;
    if (!el) return;

    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const hasRegisterProperty =
      typeof window !== "undefined" && "CSS" in window && "registerProperty" in CSS;
    if (hasRegisterProperty) return;

    let rafId = 0;
    let running = false;
    let paused = false;
    let lastTs = 0;
    let angle = 0;
    let started = false;
    let checkTimer = 0;
    const SPEED_DEG_PER_SEC = 360 / 30;

    const onEnter = () => {
      paused = true;
    };
    const onLeave = () => {
      paused = false;
    };

    function tick(ts) {
      if (!running) return;
      if (paused) {
        lastTs = ts;
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      angle = (angle + dt * SPEED_DEG_PER_SEC) % 360;
      el.style.setProperty("--spin", angle + "deg");
      rafId = requestAnimationFrame(tick);
    }

    function startJsFallback() {
      if (started) return;
      started = true;
      running = true;
      lastTs = 0;
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
      el.addEventListener("focusin", onEnter);
      el.addEventListener("focusout", onLeave);
      rafId = requestAnimationFrame(tick);
    }

    el.style.setProperty("--spin", "0deg");
    checkTimer = window.setTimeout(() => {
      const val = getComputedStyle(el).getPropertyValue("--spin").trim();
      if (!val || val === "0deg") startJsFallback();
    }, 800);

    return () => {
      window.clearTimeout(checkTimer);
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("focusin", onEnter);
      el.removeEventListener("focusout", onLeave);
    };
  }, []);

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
    <div className="h-full w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50 overflow-hidden">
      <div className="h-full flex justify-center">
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 md:py-8 text-slate-800 w-full">
          <div className="mt-2">
            <div className="mx-auto mt-8 flex items-center justify-center">
              <div
                className="category-ring"
                style={{
                  "--count": categoryList.length,
                  "--radius": "clamp(8rem, 27vw, 24rem)",
                  "--ellipseY": "0.8",
                }}
                role="list"
                ref={ringRef}
              >
                <div className="ring-center" aria-hidden="true">
                  <div className="center-halo" aria-hidden="true" />
                  <div className="center-content" role="presentation">
                    <div className="center-title-row" aria-hidden="true">
                      <div className="center-icon" aria-hidden="true">
                        <Layers />
                      </div>
                      <div className="center-title">{t.categorySearch}</div>
                    </div>
                    <div className="w-44 h-1 bg-blue-600 mx-auto rounded-full" />
                    <div className="center-subtitle">
                      {language === "ja"
                        ? "カテゴリを選択してください"
                        : t.selectcategory || t.select}
                    </div>
                  </div>
                </div>
                <div className="ring-track">
                  {categoryList.map((cat, i) => {
                    const palette = categoryColors[cat.className] || {
                      base: "#f4f4f4",
                      hover: "#e5e5e5",
                    };
                    const isHover = hoveredCategoryId === cat.id;
                    const bg = isHover ? palette.hover : palette.base;
                    const color = getTextColorForBg(bg);
                    const Icon = categoryIcons[cat.className] || Tag;
                    return (
                      <div className="ring-item" style={{ "--i": i }} key={cat.id} role="listitem">
                        <div className="ring-item-cancel">
                          <div className="ring-item-inner">
                            <Button
                              variant="ghost"
                              aria-label={cat.name[language] || cat.name.ja}
                              onClick={() => navigate(`/category/${cat.id}`)}
                              onMouseEnter={() => setHoveredCategoryId(cat.id)}
                              onMouseLeave={() => setHoveredCategoryId(null)}
                              onFocus={() => setHoveredCategoryId(cat.id)}
                              onBlur={() => setHoveredCategoryId(null)}
                              className="ring-button group border border-slate-200 shadow-sm focus-visible:ring-blue-400"
                              style={{ backgroundColor: bg, color }}
                            >
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                                <Icon className="h-6 w-6 opacity-90" />
                                <span className="text-center text-xs font-bold leading-tight">
                                  {cat.name[language] || cat.name.ja}
                                </span>
                              </div>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
