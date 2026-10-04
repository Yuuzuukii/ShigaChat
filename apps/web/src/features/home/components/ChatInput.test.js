import "@testing-library/jest-dom";
import React, { useState } from "react";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import ChatInput from "./ChatInput";
import { translations } from "../../../config/i18n";

const onSend = jest.fn();
const onApplyAction = jest.fn();

function Composer({ initialInput = "A question", ...props }) {
  const [input, setInput] = useState(initialInput);
  return <ChatInput input={input} setInput={setInput} onSend={onSend} onApplyAction={onApplyAction} t={translations.en} {...props} />;
}

beforeEach(() => {
  jest.clearAllMocks();
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
});

test("desktop Enter sends while Shift + Enter preserves a line break", () => {
  render(<Composer />);
  const input = screen.getByRole("textbox");
  const lineBreak = createEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent(input, lineBreak);
  expect(lineBreak.defaultPrevented).toBe(false);
  expect(onSend).not.toHaveBeenCalled();

  const submit = createEvent.keyDown(input, { key: "Enter" });
  fireEvent(input, submit);
  expect(submit.defaultPrevented).toBe(true);
  expect(onSend).toHaveBeenCalledTimes(1);
});

test("mobile Enter preserves a line break and the send button submits", () => {
  window.matchMedia.mockReturnValue({ matches: true });
  render(<Composer />);
  const input = screen.getByRole("textbox");
  const lineBreak = createEvent.keyDown(input, { key: "Enter" });
  fireEvent(input, lineBreak);
  expect(lineBreak.defaultPrevented).toBe(false);
  expect(onSend).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  expect(onSend).toHaveBeenCalledTimes(1);
});

test("IME composition and key code 229 do not submit a message", () => {
  render(<Composer />);
  const input = screen.getByRole("textbox");
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(onSend).not.toHaveBeenCalled();

  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSend).toHaveBeenCalledTimes(1);
});

test.each([{ loading: true }, { actionLoading: true }])("busy requests disable sending and answer actions (%j)", (busy) => {
  render(<Composer {...busy} />);
  expect(screen.getByRole("button", { name: /Ask|Generating/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Translate" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(onSend).not.toHaveBeenCalled();
});

test("answer actions remain visible and empty questions reach the page validation", () => {
  render(<Composer initialInput="   " />);
  expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Translate" })).toBeEnabled();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(onSend).toHaveBeenCalledTimes(1);
});

test("translation picker dismisses with Escape and applies the selected language", () => {
  render(<Composer />);
  const translateButton = screen.getByRole("button", { name: "Translate" });
  fireEvent.click(translateButton);
  expect(translateButton).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("button", { name: "English" })).not.toBeInTheDocument();
  expect(translateButton).toHaveFocus();

  fireEvent.click(translateButton);
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(onApplyAction).toHaveBeenCalledWith("translate", "en");
  expect(translateButton).toHaveAttribute("aria-expanded", "false");
});

test("translation portal keeps keyboard order and accepts pointer selection", () => {
  render(<Composer />);
  const translateButton = screen.getByRole("button", { name: "Translate" });
  fireEvent.click(translateButton);
  const firstLanguage = screen.getByRole("button", { name: "日本語" });
  expect(firstLanguage).toHaveFocus();
  fireEvent.keyDown(firstLanguage, { key: "Tab", shiftKey: true });
  expect(translateButton).toHaveFocus();
  expect(translateButton).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(translateButton);
  const lastLanguage = screen.getByRole("button", { name: "Bahasa Indonesia" });
  lastLanguage.focus();
  fireEvent.keyDown(lastLanguage, { key: "Tab" });
  expect(screen.getByRole("button", { name: "Summarize" })).toHaveFocus();
  expect(translateButton).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(translateButton);
  const english = screen.getByRole("button", { name: "English" });
  fireEvent.pointerDown(english);
  fireEvent.click(english);
  expect(onApplyAction).toHaveBeenCalledWith("translate", "en");
});
