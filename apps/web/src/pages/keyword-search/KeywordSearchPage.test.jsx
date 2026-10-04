import "@testing-library/jest-dom";
import React, { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KeywordSearchPage from "./KeywordSearchPage";
import { searchKeyword } from "./api";

const mockSetSearchParams = jest.fn();
let mockSearch = "";
const mockTranslations = {
  keyword: "キーワード検索", enterKeyword: "キーワードを入力", search: "検索",
  keywordRequired: "キーワードを入力してください", loading: "読み込み中",
  noResults: "見つかりませんでした", answer: "回答", category: "カテゴリ",
};

jest.mock("react-router-dom", () => ({
  useOutletContext: () => ({ language: "ja", t: mockTranslations }),
  useSearchParams: () => [new URLSearchParams(mockSearch), mockSetSearchParams],
}), { virtual: true });

jest.mock("./api", () => ({ searchKeyword: jest.fn() }));
jest.mock("../../features/common/Toaster", () => ({ toast: { error: jest.fn() } }));

const response = (questions) => ({ ok: true, json: async () => questions });

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = "";
});

test("keeps the input accessible and validates an empty submission", () => {
  render(<KeywordSearchPage />);
  const input = screen.getByRole("searchbox", { name: "キーワードを入力" });
  expect(input).not.toHaveFocus();
  expect(input).toHaveAttribute("enterkeyhint", "search");
  fireEvent.submit(screen.getByRole("search"));
  expect(screen.getByRole("alert")).toHaveTextContent("キーワードを入力してください");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveFocus();
  expect(searchKeyword).not.toHaveBeenCalled();
});

test("shows only the newest query when responses arrive out of order", async () => {
  let resolveFirst;
  searchKeyword.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
  searchKeyword.mockResolvedValueOnce(response([{ question_id: 2, question_text: "新しい検索結果", answer_text: "新しい回答" }]));
  mockSearch = "q=最初";
  const { rerender } = render(<KeywordSearchPage />);
  expect(await screen.findByRole("status")).toHaveTextContent("読み込み中");

  mockSearch = "q=次の検索";
  rerender(<KeywordSearchPage />);
  expect(await screen.findByRole("button", { name: "新しい検索結果" })).toBeInTheDocument();
  await act(async () => { resolveFirst(response([{ question_id: 1, question_text: "古い検索結果" }])); });
  expect(screen.queryByText("古い検索結果")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "新しい検索結果" }));
  expect(screen.getByText("新しい回答")).toBeVisible();
  await waitFor(() => { expect(searchKeyword).toHaveBeenNthCalledWith(2, "次の検索"); });
});
