/**
 * S08: メンテナンス画面
 * - D01: メンテナンスアイコン（工具）
 * - D02: メンテナンスメッセージ（多言語対応）
 * - D03: 補足メッセージ
 * 表示条件: MAINTENANCE_MODE=true の場合に全画面表示
 */
import React from "react";
import { useLanguage } from "../hooks/useLanguage";
import LanguageSelector from "../components/layout/LanguageSelector";
import { Wrench } from "lucide-react";

export default function MaintenancePage() {
  const { language, t, changeLanguageLocal } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-4">
      {/* 言語切替（右上） */}
      <div className="absolute top-4 right-4">
        <LanguageSelector
          value={language}
          onChange={changeLanguageLocal}
          size="small"
        />
      </div>

      <div className="text-center max-w-md">
        {/* D01: メンテナンスアイコン */}
        <div className="flex justify-center mb-6">
          <div className="rounded-full bg-amber-100 p-5">
            <Wrench className="h-16 w-16 text-amber-600" />
          </div>
        </div>

        {/* D02: メンテナンスメッセージ */}
        <h1 className="text-2xl font-bold text-zinc-800 mb-3">
          {t.maintenanceTitle}
        </h1>

        {/* D03: 補足メッセージ */}
        <p className="text-zinc-500 leading-relaxed">
          {t.maintenanceMessage}
        </p>
      </div>
    </div>
  );
}
