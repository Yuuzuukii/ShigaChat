const { test, expect } = require("@playwright/test");
const { loadEvalCases, loadEvalConversations, evaluate } = require("../lib/eval");
const { openNewChat, ask, appendJsonl } = require("../lib/chat");

// 回答の妥当性: 実際の画面から質問し、回答を LLM で採点する。
// 結果は eval.jsonl に残り、終了時に eval-results.csv と eval-summary.json にまとまる。

test.describe("回答の妥当性(単発) @quality-single", () => {
  for (const c of loadEvalCases()) {
    test(`${c.id} [${c.category}] ${c.question}`, async ({ page }) => {
      await openNewChat(page);
      const meta = { kind: "single", case_id: c.id, turn: 1, category: c.category, summary: "" };
      const entry = await ask(page, c.question, meta);
      const result = await evaluate(entry, c);
      appendJsonl("eval.jsonl", {
        kind: "single",
        case_id: c.id,
        turn: 1,
        category: c.category,
        question: c.question,
        answer: entry.answer,
        seconds: entry.seconds,
        references: entry.references.map((r) => `${r.question_id}:${r.question}`),
        gold_ids: c.goldIds,
        gold_titles: c.goldTitles,
        expect_refs: c.expectRefs,
        ...result,
      });
      expect(result.judge_verdict, `score=${result.judge_score} ${result.judge_reason}`).toBe("pass");
    });
  }
});

test.describe("回答の妥当性(連続質問) @quality-conversation", () => {
  for (const conv of loadEvalConversations()) {
    test(`${conv.id} [${conv.category}] ${conv.turns[0].question}`, async ({ page }) => {
      await openNewChat(page);
      const history = [];
      for (const [index, c] of conv.turns.entries()) {
        const meta = { kind: "conversation", case_id: conv.id, turn: index + 1, category: conv.category, summary: "" };
        const entry = await ask(page, c.question, meta);
        const result = await evaluate(entry, c, history);
        history.push({ question: c.question, answer: entry.answer });
        appendJsonl("eval.jsonl", {
          kind: "conversation",
          case_id: conv.id,
          turn: index + 1,
          category: conv.category,
          question: c.question,
          answer: entry.answer,
          seconds: entry.seconds,
          references: entry.references.map((r) => `${r.question_id}:${r.question}`),
          gold_ids: c.goldIds,
          gold_titles: c.goldTitles,
          expect_refs: c.expectRefs,
          ...result,
        });
        // 1ターン失敗しても、後続のターンも測るため soft で検証する
        expect
          .soft(result.judge_verdict, `${conv.id} ターン${index + 1}: score=${result.judge_score} ${result.judge_reason}`)
          .toBe("pass");
      }
    });
  }
});
