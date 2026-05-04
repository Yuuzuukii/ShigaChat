export function toClientThreads(serverThreads = [], titleOverrides = {}) {
  return (serverThreads || []).map((thread) => {
    const id = String(thread.thread_id ?? thread.id);
    const serverTitle = String(thread.title || "").trim();
    const overrideTitle = String(titleOverrides[id] || "").trim();
    const looksOldAutoTruncated = /\.\.\.$|…$/.test(overrideTitle);
    const title = overrideTitle && !looksOldAutoTruncated ? overrideTitle : serverTitle;

    return {
      id,
      title,
      lastUpdated: thread.last_updated ?? thread.lastUpdated ?? new Date().toISOString(),
    };
  });
}

export function toClientMessages(serverMessages = []) {
  const clientMessages = [];

  (serverMessages || []).forEach((message) => {
    clientMessages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: message.question,
      time: message.created_at,
      type: message.type,
    });
    clientMessages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: message.answer,
      time: message.created_at,
      rag_qa: message.rag_qa || [],
      type: message.type || (message.rag_qa?.length > 0 ? "rag" : ""),
    });
  });

  return clientMessages;
}
