import "@testing-library/jest-dom";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserContext } from "../contexts/UserContext";
import { translations } from "../config/i18n";
import LoginPage from "./login/LoginPage";
import RegisterPage from "./register/RegisterPage";
import { postLogin } from "./login/api";
import { postRegister } from "./register/api";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock("./login/api", () => ({ postLogin: jest.fn(), fetchCurrentUser: jest.fn() }));
jest.mock("./register/api", () => ({ postRegister: jest.fn() }));

function renderAuth(page) {
  return render(
    <UserContext.Provider value={{ user: null, t: translations.en, setToken: jest.fn(), setUser: jest.fn() }}>
      {page}
    </UserContext.Provider>
  );
}

beforeEach(() => jest.clearAllMocks());

test("the original login action identifies a credential error", async () => {
  postLogin.mockResolvedValue({ ok: false, status: 401 });
  renderAuth(<LoginPage />);

  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "mobile-user" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: "Login", exact: true }));

  await waitFor(() => expect(postLogin).toHaveBeenCalledWith("mobile-user", "password123"));
  expect(await screen.findByRole("alert")).toHaveTextContent(translations.en.errorInvalidLogin);
});

test("revealing a password preserves the value and does not submit the form", () => {
  renderAuth(<LoginPage />);
  const password = screen.getByLabelText("Password");
  fireEvent.change(password, { target: { value: "password123" } });

  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(password).toHaveAttribute("type", "text");
  expect(password).toHaveValue("password123");
  expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  expect(postLogin).not.toHaveBeenCalled();
});

test("the registration language control exposes its label and validation error", () => {
  renderAuth(<RegisterPage />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "mobile-user" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.submit(screen.getByRole("form", { name: "Sign Up" }));

  const language = screen.getByRole("combobox", { name: "Language" });
  expect(language).toHaveAttribute("aria-invalid", "true");
  expect(language).toHaveAttribute("aria-describedby", "spokenLanguage-error");
  expect(screen.getByRole("alert")).toHaveTextContent(translations.en.errorEmptyLanguage);
  expect(postRegister).not.toHaveBeenCalled();
});
