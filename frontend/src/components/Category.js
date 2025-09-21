import React, { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext";
import {
  translations,
  categoryList,
  languageLabelToCode,
} from "../config/constants";
import { redirectToLogin } from "../utils/auth";
import { Button } from "./ui/button";
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
  Layers
} from "lucide-react";
import "./Category.css"; // 円形レイアウト用のスタイルを読み込み

const categoryColors = {
  // 元CSSの色をマッピング
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
  // hex -> #rrggbb
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return "#1f2937"; // slate-800
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const srgb = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance > 0.6 ? "#1f2937" : "#ffffff"; // 明るい背景→濃い文字、暗い背景→白
}

const Kategori = () => {
  const navigate = useNavigate();
  const { user, fetchUser } = useContext(UserContext);
  const [language, setLanguage] = useState("ja");
  const [hoveredCategoryId, setHoveredCategoryId] = useState(null);
  const ringRef = useRef(null);
  const t = translations[language];

  useEffect(() => {
    if (user?.spokenLanguage) {
      const code = languageLabelToCode[user.spokenLanguage];
      setLanguage(code || "ja");
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
    return () => window.removeEventListener("tokenUpdated", handleTokenUpdate);
  }, [user, navigate, fetchUser]);

  // CSS @property(--spin) 非対応時のフォールバック（JSで--spinを更新）
  useEffect(() => {
    const el = ringRef.current;
    if (!el) return;

    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return; // モーション低減ではフォールバックもしない

    const hasRegisterProperty = typeof window !== 'undefined' && 'CSS' in window && 'registerProperty' in CSS;
    if (hasRegisterProperty) return; // 充分なサポートがあるとみなし、CSSのアニメーションに任せる

    // 検出: 一定時間後に --spin が変化していなければJSフォールバック起動
    let rafId = 0;
    let running = false;
    let paused = false;
    let lastTs = 0;
    let angle = 0;
    let started = false;
    let checkTimer = 0;

    const SPEED_DEG_PER_SEC = 360 / 30; // CSSと同じ30秒/周

    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };

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
      el.style.setProperty('--spin', angle + 'deg');
      rafId = requestAnimationFrame(tick);
    }

    function startJsFallback() {
      if (started) return;
      started = true;
      running = true;
      lastTs = 0;
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
      el.addEventListener('focusin', onEnter);
      el.addEventListener('focusout', onLeave);
      rafId = requestAnimationFrame(tick);
    }

    // 初期値リセット
    el.style.setProperty('--spin', '0deg');
    // 800ms後に--spinが変化していなければ非対応とみなす
    checkTimer = window.setTimeout(() => {
      const val = getComputedStyle(el).getPropertyValue('--spin').trim();
      if (!val || val === '0deg') {
        startJsFallback();
      }
    }, 800);

    return () => {
      window.clearTimeout(checkTimer);
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focusin', onEnter);
      el.removeEventListener('focusout', onLeave);
    };
  }, []);

  return (
    <div className="h-full w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50 overflow-hidden">
      <div className="h-full flex justify-center ">
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 md:py-8 text-slate-800 w-full">
          {/* 共通ヘッダーに統一。本文のみ */}
          <div className="mt-2">
            {/* 円形にカテゴリを配置し、自動回転（ホバーで停止） */}
            <div className="mx-auto mt-8 flex items-center justify-center">
              <div
                className="category-ring"
                style={{ '--count': categoryList.length, '--radius': 'clamp(8rem, 27vw, 24rem)', '--ellipseY': '0.8' }}
                role="list"
                ref={ringRef}
              >
                <div className="ring-center" aria-hidden="true">
                  <div className="center-halo" aria-hidden="true"></div>
                  <div className="center-content" role="presentation">
                    <div className="center-title-row" aria-hidden="true">
                      <div className="center-icon" aria-hidden="true"><Layers /></div>
                      <div className="center-title">{t.categorySearch}</div>
                    </div>
                    <div className="w-44 h-1 bg-blue-600 mx-auto rounded-full"></div>
                    <div className="center-subtitle ">{language === 'ja' ? 'カテゴリを選択してください' : (t.selectcategory || t.select)}</div>
                  </div>
                </div>
                <div className="ring-track">
                  {categoryList.map((category, i) => {
                    const palette = categoryColors[category.className] || { base: "#f4f4f4", hover: "#e5e5e5" };
                    const isHover = hoveredCategoryId === category.id;
                    const bg = isHover ? palette.hover : palette.base;
                    const color = getTextColorForBg(bg);
                    const Icon = categoryIcons[category.className] || Tag;
                    return (
                      <div className="ring-item" style={{ ['--i']: i }} key={category.id} role="listitem">
                        <div className="ring-item-cancel">
                          <div className="ring-item-inner">
                            <Button
                              variant="ghost"
                              aria-label={category.name[language] || category.name.ja}
                              onClick={() => navigate(`/category/${category.id}`)}
                              onMouseEnter={() => setHoveredCategoryId(category.id)}
                              onMouseLeave={() => setHoveredCategoryId(null)}
                              onFocus={() => setHoveredCategoryId(category.id)}
                              onBlur={() => setHoveredCategoryId(null)}
                              className="ring-button group border border-slate-200 shadow-sm focus-visible:ring-blue-400"
                              style={{ backgroundColor: bg, color }}
                            >
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                                <Icon className="h-6 w-6 opacity-90" />
                                <span className="text-center text-xs font-bold leading-tight">
                                  {category.name[language] || category.name.ja}
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
};

export default Kategori;
