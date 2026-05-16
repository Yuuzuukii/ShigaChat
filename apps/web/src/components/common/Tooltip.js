/**
 * Tooltip - サイドバー折りたたみ時のツールチップ
 */
import React from "react";

export default function Tooltip({ children, content, isVisible = true }) {
  if (!isVisible || !content) return children;
  return (
    <div className="group relative w-full overflow-visible">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 z-[200] ml-3 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <div className="relative whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg">
          {content}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>
      </div>
    </div>
  );
}
