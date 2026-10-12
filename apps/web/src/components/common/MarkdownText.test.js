import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import MarkdownText from "./MarkdownText";

test("見出し・強調・リスト・リンクをレンダリングする", () => {
  const md = "## 見出し\n\n**重要** です\n\n- 項目1\n- 項目2\n\n[リンク](https://example.com)";
  render(<MarkdownText content={md} />);
  expect(screen.getByRole("heading", { level: 2, name: "見出し" })).toBeInTheDocument();
  expect(screen.getByText("重要")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  const a = screen.getByRole("link", { name: "リンク" });
  expect(a).toHaveAttribute("href", "https://example.com");
  expect(a).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.queryByText(/\*\*/)).toBeNull();
});

test("生HTMLとjavascript:リンクは描画しない", () => {
  render(<MarkdownText content={"<b>raw</b> [x](javascript:alert(1))"} />);
  expect(screen.getByText(/<b>raw<\/b>/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "x" })).not.toHaveAttribute(
    "href",
    expect.stringMatching(/^javascript/)
  );
});
