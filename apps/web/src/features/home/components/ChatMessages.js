/**
 * ChatMessages - チャットメッセージ表示エリア
 */
import React from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import MessageBubble from "./MessageBubble";

export default function ChatMessages({
  messages, messagesLoading, currentThreadId, t, navigate,
  messagesContainerRef, messagesEndRef, suppressEntranceAnimation = false,
}) {
  const renderedMessages = !messagesLoading && messages.length > 0 && messages.map((m, index) => (
    <MessageBubble
      key={m.id}
      message={m}
      index={index}
      t={t}
      navigate={navigate}
      suppressEntranceAnimation={suppressEntranceAnimation}
    />
  ));

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 max-lg:p-0" ref={messagesContainerRef} aria-busy={messagesLoading}>
      <div className="mx-auto h-full min-w-0 w-full max-w-4xl max-lg:px-3 max-lg:pb-3 max-lg:pt-16">
        {/* Loading spinner */}
        {messagesLoading && currentThreadId && (
          <div role="status" className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-zinc-600">メッセージを読み込み中...</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!messagesLoading && (!currentThreadId || messages.length === 0) && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="mb-4 rounded-full bg-blue-100 p-4 mx-auto w-fit">
                <MessageCircle className="h-8 w-8 text-blue-600" />
              </div>
              <p className="text-lg font-medium text-zinc-800">{t?.askQuestion || "質問してみよう"}</p>
              <p className="text-xs text-zinc-500 mt-2">{t?.disclaimer || "ShigaChatの情報は正確でない場合があります"}</p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div>{renderedMessages}</div>
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
}
