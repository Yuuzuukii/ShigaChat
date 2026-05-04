/**
 * S07: Not Found（404）画面
 * - D01: エラーコード 404
 * - D02: ページが見つかりません（多言語対応）
 * - D03: 補足メッセージ
 * - D04: ログイン済み→ /home / 未ログイン→ /login へ遷移リンク
 */
import React, { useContext } from "react";
import { Link } from "react-router-dom";
import { UserContext } from "../contexts/UserContext";
import { useLanguage } from "../hooks/useLanguage";
import { FileQuestion } from "lucide-react";

export default function NotFoundPage() {
  const { user } = useContext(UserContext);
  const { t } = useLanguage();

  const isLoggedIn = !!user;
  const linkTo = isLoggedIn ? "/home" : "/login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-4">
      <div className="text-center max-w-md">
        {/* D01: エラーコード */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <FileQuestion className="h-20 w-20 text-blue-300" />
            <span className="absolute -bottom-2 -right-2 text-5xl font-extrabold text-blue-600">
              404
            </span>
          </div>
        </div>

        {/* D02: メッセージ */}
        <h1 className="text-2xl font-bold text-zinc-800 mb-3">
          {t.notFoundTitle}
        </h1>

        {/* D03: 補足メッセージ */}
        <p className="text-zinc-500 mb-8 leading-relaxed">
          {t.notFoundMessage}
        </p>

        {/* D04: 遷移リンク */}
        <Link
          to={linkTo}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white font-medium shadow-sm transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
        >
          {t.goHome}
        </Link>
      </div>
    </div>
  );
}
