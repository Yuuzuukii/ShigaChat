import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoryDetailPage from "./CategoryDetailPage";
import { fetchCategoryTranslation, fetchCategoryQuestions, addHistory } from "../api";
import { toast } from "../../../features/common/Toaster";

const mockNavigate = jest.fn();
const mockSetSearchParams = jest.fn();
const mockUseOutletContext = jest.fn();
const mockUseParams = jest.fn(() => ({ categoryId: "1" }));
const mockUseSearchParams = jest.fn(() => [new URLSearchParams(), mockSetSearchParams]);

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => mockNavigate,
    useOutletContext: () => mockUseOutletContext(),
    useParams: () => mockUseParams(),
    useSearchParams: () => mockUseSearchParams(),
  }),
  { virtual: true }
);

jest.mock("../api", () => ({
  fetchCategoryTranslation: jest.fn(),
  fetchCategoryQuestions: jest.fn(),
  addHistory: jest.fn(),
}));

jest.mock("../../../features/category/CategoryAnswerText", () => ({
  __esModule: true,
  default: ({ content }) => <span>{content}</span>,
}));

jest.mock("../../../features/common/Toaster", () => ({
  toast: {
    error: jest.fn(),
  },
}));

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

function renderCategoryDetailPage({ search = "" } = {}) {
  mockUseOutletContext.mockReturnValue({
    language: "ja",
    t: {
      loading: "読み込み中...",
      categorynotfound: "カテゴリが見つかりません。",
      qaFetchError: "Q&Aの取得に失敗しました",
      language: "言語",
      answer: "回答：",
      questionDate: "最終更新日時：",
      noQuestions: "このカテゴリにはQ&Aがありません。",
      backButton: "カテゴリ一覧に戻る",
    },
    isDrawerOpen: false,
    scrollContainerRef: { current: null },
  });
  mockUseSearchParams.mockReturnValue([new URLSearchParams(search), mockSetSearchParams]);

  return render(<CategoryDetailPage />);
}

describe("CategoryDetailPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ categoryId: "1" });
    mockUseSearchParams.mockReturnValue([new URLSearchParams(), mockSetSearchParams]);
  });

  test("translates QA text in place and keeps the expanded answer open", async () => {
    fetchCategoryTranslation.mockResolvedValue(
      mockResponse({ カテゴリ名: { description: "在留" } })
    );
    fetchCategoryQuestions
      .mockResolvedValueOnce(
        mockResponse({
          questions: [
            {
              question_id: 1,
              answer_id: 10,
              質問: "日本語の質問",
              回答: "日本語の回答",
              title: "official",
              time: "2026-04-08T00:00:00Z",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          questions: [
            {
              question_id: 1,
              answer_id: 10,
              質問: "English question",
              回答: "English answer",
              title: "official",
              time: "2026-04-08T00:00:00Z",
            },
          ],
        })
      );

    renderCategoryDetailPage();

    expect(await screen.findByRole("heading", { name: "在留" })).toBeInTheDocument();
    expect(await screen.findByText("日本語の質問")).toBeInTheDocument();
    expect(fetchCategoryQuestions).toHaveBeenCalledWith("1", "ja");
    expect(screen.getByTestId("qa-language-tabs")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "言語" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "日本語" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "English" })).toBeInTheDocument();

    await userEvent.click(screen.getByText("日本語の質問"));

    expect(await screen.findByText("日本語の回答")).toBeInTheDocument();
    expect(addHistory).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole("tab", { name: "English" }));

    await waitFor(() => {
      expect(fetchCategoryQuestions).toHaveBeenLastCalledWith("1", "en");
    });
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    const lastSetSearchParamsCall =
      mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1];
    expect(lastSetSearchParamsCall[0].get("lang")).toBe("en");

    expect(await screen.findByText("English question")).toBeInTheDocument();
    expect(await screen.findByText("English answer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "在留" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true");
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("uses QA language from URL query on initial load", async () => {
    fetchCategoryTranslation.mockResolvedValue(
      mockResponse({ カテゴリ名: { description: "在留" } })
    );
    fetchCategoryQuestions.mockResolvedValueOnce(
      mockResponse({
        questions: [
          {
            question_id: 1,
            answer_id: 10,
            質問: "English question",
            回答: "English answer",
            title: "official",
            time: "2026-04-08T00:00:00Z",
          },
        ],
      })
    );

    renderCategoryDetailPage({ search: "lang=en" });

    expect(await screen.findByText("English question")).toBeInTheDocument();
    expect(fetchCategoryQuestions).toHaveBeenCalledWith("1", "en");
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true");
  });
});
