/**
 * AuthLayout - ログイン/新規登録画面の共通レイアウト
 * S01, S02 で使用する背景・中央カードレイアウト
 */
import React from "react";

export default function AuthLayout({ children }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background: soft glass + blobs + grid */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_10%_10%,rgba(59,130,246,0.12),transparent_60%),radial-gradient(50%_50%_at_90%_20%,rgba(14,165,233,0.12),transparent_60%),linear-gradient(to_bottom,rgba(239,246,255,1),rgba(255,255,255,1))]" />
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:28px_28px]" />

      <div className="relative z-0 mx-auto grid min-h-screen w-full max-w-6xl place-items-center px-4">
        {children}
      </div>
    </div>
  );
}
