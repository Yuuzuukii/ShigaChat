import "@testing-library/jest-dom";
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppLayout from "./AppLayout";
import { UserContext } from "../../contexts/UserContext";

const mockSelectThread = jest.fn();
const mockStartNewChat = jest.fn();
const mockDeleteThread = jest.fn().mockResolvedValue(true);
let mockLocation = { pathname: "/home", search: "" };
let mockMediaListeners;
let mockViewportListeners;
let mockDesktop;

jest.mock("../home/state/useThreads", () => ({
  useThreads: () => ({
    threads: [{ id: "1", title: "Test conversation" }],
    selectThread: mockSelectThread,
    startNewChat: mockStartNewChat,
    renameThread: jest.fn(),
    removeThread: mockDeleteThread,
  }),
}));
jest.mock("./Toaster", () => ({ Toaster: () => null }));
jest.mock("react-router-dom", () => ({
  useLocation: () => mockLocation,
  useNavigate: () => jest.fn(),
  Outlet: () => <div>Page content</div>,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  NavLink: ({ to, children, className, ...props }) => (
    <a href={to} className={className({ isActive: to === mockLocation.pathname })} {...props}>{children}</a>
  ),
}), { virtual: true });

const value = {
  user: { id: 1, nickname: "Test", spokenLanguage: "English" }, token: "test",
  logout: jest.fn(), redirectToLogin: jest.fn(), isLoading: false, language: "en",
  t: { menu: "Menu", close: "Close", home: "Home", category: "Categories", newChat: "New chat", threads: "Conversations", renameThread: "Rename", delete: "Delete", cancel: "Cancel", logout: "Logout", confirmDeleteThread: "Delete conversation?" },
};
function renderLayout() {
  return render(<UserContext.Provider value={value}><AppLayout /></UserContext.Provider>);
}
function resizeDesktop(matches) {
  mockDesktop = matches;
  act(() => mockMediaListeners.forEach((listener) => listener()));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDesktop = false;
  mockLocation = { pathname: "/home", search: "" };
  mockMediaListeners = new Set();
  mockViewportListeners = new Set();
  window.matchMedia = jest.fn(() => ({
    get matches() { return mockDesktop; },
    addEventListener: (_, listener) => mockMediaListeners.add(listener),
    removeEventListener: (_, listener) => mockMediaListeners.delete(listener),
  }));
  Object.defineProperty(window, "visualViewport", { configurable: true, value: {
    height: 844, scale: 1,
    addEventListener: (_, listener) => mockViewportListeners.add(listener),
    removeEventListener: (_, listener) => mockViewportListeners.delete(listener),
  } });
  HTMLElement.prototype.scrollTo = jest.fn();
});

test("mobile drawer starts closed, traps focus, and restores focus after Escape", () => {
  renderLayout();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: "Menu" });
  toggle.focus();
  fireEvent.click(toggle);
  const drawer = screen.getByRole("dialog", { name: "Menu" });
  const close = within(drawer).getByRole("button", { name: "Close" });
  expect(close).toHaveFocus();
  // The inert attribute belongs to the content wrapper, not the main landmark.
  // eslint-disable-next-line testing-library/no-node-access
  expect(screen.getByRole("main", { hidden: true }).parentElement).toHaveAttribute("inert");
  const account = within(drawer).getByRole("button", { name: "Test: Menu" });
  account.focus();
  fireEvent.keyDown(account, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(toggle).toHaveFocus();
  // eslint-disable-next-line testing-library/no-node-access
  expect(screen.getByRole("main").parentElement).not.toHaveAttribute("inert");
});

test("choosing the current conversation still closes the mobile drawer", () => {
  renderLayout();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("button", { name: "Test conversation" }));
  expect(mockSelectThread).toHaveBeenCalledWith("1");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("desktop collapse is independent from the closed mobile drawer", () => {
  mockDesktop = true;
  renderLayout();
  const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  resizeDesktop(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  resizeDesktop(true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(document.body.style.overflow).toBe("");
});

test("keyboard viewport changes resize the shell and desktop clears the override", () => {
  const { container, unmount } = renderLayout();
  // Assert the CSS variable that drives the viewport layout.
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  const shell = container.querySelector(".app-shell");
  expect(shell.style.getPropertyValue("--app-height")).toBe("844px");
  act(() => {
    window.visualViewport.height = 360;
    mockViewportListeners.forEach((listener) => listener());
  });
  expect(shell.style.getPropertyValue("--app-height")).toBe("360px");
  resizeDesktop(true);
  expect(shell.style.getPropertyValue("--app-height")).toBe("");
  expect(mockViewportListeners.size).toBe(0);
  unmount();
  expect(mockMediaListeners.size).toBe(0);
});

test("account options follow their trigger and nested confirmation restores its trigger", () => {
  renderLayout();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  const account = screen.getByRole("button", { name: "Test: Menu" });
  account.focus();
  fireEvent.click(account);
  userEvent.tab();
  expect(screen.getByRole("button", { name: "Logout" })).toHaveFocus();
  const threadMenu = screen.getByRole("button", { name: "Menu: Test conversation" });
  fireEvent.click(threadMenu);
  expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  const dialog = screen.getByRole("alertdialog", { name: "Delete conversation?" });
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "Cancel" }), { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(threadMenu).toHaveFocus();
  expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
});
