/**
 * ConfirmDialog - 確認ダイアログ（W01: 遷移警告ダイアログ）
 * 画面仕様書 W01 に準拠
 */
import React, { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalSurface } from "../../features/common/useModalSurface";
import { Button } from "../ui/button";

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel, cancelLabel }) {
  const surfaceRef = useRef(null);
  const backgroundRef = useRef(document.getElementById("root"));
  const titleId = useId();
  const messageId = useId();
  useModalSurface(open, surfaceRef, onCancel, backgroundRef);
  if (!open) return null;

  return createPortal(
    <div className="responsive-dialog fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div ref={surfaceRef} role="alertdialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : confirmLabel || "Confirm"} aria-describedby={message ? messageId : undefined} tabIndex={-1} className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl">
        {title && <h3 id={titleId} className="mb-2 text-lg font-semibold text-zinc-800">{title}</h3>}
        <p id={messageId} className="mb-6 text-sm text-zinc-600">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} className="px-4">
            {cancelLabel || "キャンセル"}
          </Button>
          <Button onClick={onConfirm} className="bg-blue-600 px-4 text-white hover:bg-blue-700">
            {confirmLabel || "OK"}
          </Button>
        </div>
      </div>
    </div>, document.body
  );
}
