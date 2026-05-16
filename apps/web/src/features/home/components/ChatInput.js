/**
 * ChatInput - チャット入力エリア（テキスト + 送信ボタン）
 */
import React, { useRef, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import ActionBar from "./ActionBar";

export default function ChatInput({
  input,
  setInput,
  loading,
  actionLoading,
  errorMessage,
  actionMessage,
  t,
  onSend,
  onApplyAction,
  similarity: _similarity,
  onSimilarityChange: _onSimilarityChange,
}) {
  const textareaRef = useRef(null);

  const handleInputChange = useCallback(
    (e) => {
      setInput(e.target.value);
      if (!e.target.value.trim()) {
        e.target.style.height = "40px";
        return;
      }
      e.target.style.height = "auto";
      const newHeight = Math.min(Math.max(e.target.scrollHeight, 40), 128);
      e.target.style.height = newHeight + "px";
    },
    [setInput]
  );

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
      if (textareaRef.current) textareaRef.current.style.height = "40px";
    }
  };

  const handleSend = () => {
    onSend();
    if (textareaRef.current) textareaRef.current.style.height = "40px";
  };

  return (
    <div className="backdrop-blur-sm p-4">
      <div className="mx-auto w-full max-w-4xl">
        <Card>
          <CardContent className="p-4">
            {/* Action bar */}
            <div className="mb-3">
              <ActionBar t={t} actionLoading={actionLoading} onApplyAction={onApplyAction} />
            </div>

            {/* Error messages */}
            {errorMessage && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}
            {actionMessage && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">
                {actionMessage}
              </div>
            )}

            {/* Input area */}
            <div className="flex gap-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={t?.placeholder || "ここに質問を入力してください..."}
                className="flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 min-h-[2.5rem] h-10 leading-5"
                rows="1"
              />
              <Button
                onClick={handleSend}
                disabled={loading}
                className="w-20 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 font-medium text-white transition-all hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-sm flex items-center justify-center"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-3 w-3" />
                    <span className="hidden sm:inline">{t?.askButton || "送信"}</span>
                  </>
                )}
              </Button>
            </div>
            <div className="flex justify-between">
              <div className="mt-2 text-xs text-zinc-500">⌘/Ctrl + Enter で送信</div>
              <div className="mt-2 text-xs text-zinc-500">
                ※ 本サービスへの質問による個人情報の漏洩に関しては、一切の責任を負いかねます
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
