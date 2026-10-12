const { test } = require("@playwright/test");
const { loadSingleCases, loadConversations } = require("../lib/cases");
const { openNewChat, ask } = require("../lib/chat");

test.describe("単発の質問 @single", () => {
  for (const c of loadSingleCases()) {
    test(`#${c.id} [${c.category}] ${c.question}`, async ({ page }) => {
      await openNewChat(page);
      await ask(page, c.question, {
        kind: "single",
        case_id: c.id,
        turn: 1,
        category: c.category,
        summary: c.summary,
      });
    });
  }
});

test.describe("連続チャット @conversation", () => {
  for (const conv of loadConversations()) {
    test(`${conv.id} [${conv.category}] ${conv.turns[0]}`, async ({ page }) => {
      // 1 スレッドの中で続けて質問する
      await openNewChat(page);
      for (const [index, question] of conv.turns.entries()) {
        await ask(page, question, {
          kind: "conversation",
          case_id: conv.id,
          turn: index + 1,
          category: conv.category,
          summary: "",
        });
      }
    });
  }
});
