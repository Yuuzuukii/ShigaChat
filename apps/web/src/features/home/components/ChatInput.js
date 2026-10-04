import React, { useEffect, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import ActionBar from "./ActionBar";

const MAX_INPUT_HEIGHT = 128;
const MOBILE_INPUT_QUERY = "(max-width: 1023px), (pointer: coarse)";

/** Preserve the original composer; flex flow keeps it above the mobile keyboard. */
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
}) {
  const textareaRef = useRef(null);
  const isComposingRef = useRef(false);
  const isBusy = loading || actionLoading;
  const canSend = !isBusy;
  const inputLabel = t?.placeholder || "ここに質問を入力してください...";
  const sendLabel = t?.askButton || "送信";

  // Controlled value changes include clearing the field after a successful send.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const minHeight = window.matchMedia?.("(max-width: 1023px)").matches ? 44 : 40;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(MAX_INPUT_HEIGHT, Math.max(minHeight, textarea.scrollHeight))}px`;
  }, [input]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canSend) onSend();
  };

  const handleKeyDown = (event) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      isComposingRef.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229 ||
      window.matchMedia?.(MOBILE_INPUT_QUERY).matches
    ) {
      return;
    }
    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <div className="flex max-h-full min-h-0 shrink-0 flex-col p-4 backdrop-blur-sm max-lg:p-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-col">
        <Card className="flex min-h-0 flex-col">
          <CardContent className="flex min-h-0 flex-col p-4 max-lg:p-3 lg:px-6 lg:pb-6 lg:pt-2">
            <div className="mb-3 min-h-0 shrink max-lg:overflow-y-auto max-lg:overscroll-contain">
              <ActionBar t={t} actionLoading={isBusy} onApplyAction={onApplyAction} />
              {errorMessage && (
                <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700 [overflow-wrap:anywhere]">
                  {errorMessage}
                </p>
              )}
              {actionMessage && (
                <p role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700 [overflow-wrap:anywhere]">
                  {actionMessage}
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex shrink-0 gap-3">
              <label htmlFor="chat-question" className="sr-only">{inputLabel}</label>
              <textarea
                id="chat-question"
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; }}
                placeholder={inputLabel}
                aria-describedby="chat-input-help"
                className="h-10 min-h-[2.5rem] max-h-[min(8rem,calc(var(--app-height,100dvh)*0.2))] min-w-0 flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm leading-5 transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 max-lg:h-11 max-lg:min-h-11 max-lg:text-base"
                rows={1}
              />
              <Button
                type="submit"
                disabled={!canSend}
                aria-label={loading ? t?.generatingAnswer || "回答を生成しています..." : sendLabel}
                className="flex w-20 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white transition-all hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 max-lg:h-auto max-lg:min-h-11 max-sm:w-11"
              >
                {isBusy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : (
                  <>
                    <Send aria-hidden="true" className="h-3 w-3 max-lg:shrink-0" />
                    <span className="hidden sm:inline">{sendLabel}</span>
                  </>
                )}
              </Button>
            </form>

            <div id="chat-input-help" className="flex min-h-0 shrink justify-between max-lg:flex-col max-lg:overflow-y-auto max-lg:overscroll-contain">
              <div className="mt-2 text-xs text-zinc-500 max-lg:hidden">Enter で送信 / Shift + Enter で改行</div>
              <div className="mt-2 text-xs text-zinc-500 [overflow-wrap:anywhere]">
                ※ 本サービスへの質問による個人情報の漏洩に関しては、一切の責任を負いかねます
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
