/**
 * ConfirmDialog - 確認ダイアログ（W01: 遷移警告ダイアログ）
 * 画面仕様書 W01 に準拠
 */
import React from "react";
import { Button } from "../ui/button";

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel, cancelLabel }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl">
        {title && <h3 className="mb-2 text-lg font-semibold text-zinc-800">{title}</h3>}
        <p className="mb-6 text-sm text-zinc-600">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} className="px-4">
            {cancelLabel || "キャンセル"}
          </Button>
          <Button onClick={onConfirm} className="bg-blue-600 px-4 text-white hover:bg-blue-700">
            {confirmLabel || "OK"}
          </Button>
        </div>
      </div>
    </div>
  );
}
