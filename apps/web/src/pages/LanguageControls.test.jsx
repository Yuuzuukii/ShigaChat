import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import LoginPage from "./login/LoginPage";
import RegisterPage from "./register/RegisterPage";
import MaintenancePage from "./maintenance/MaintenancePage";
import Header from "../features/layout/Header";
import { UserContext } from "../contexts/UserContext";

const mockNavigate = jest.fn();

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");

    return {
      MemoryRouter: ({ children }) => <>{children}</>,
      Link: ({ children, to, ...props }) => (
        <a href={to} {...props}>
          {children}
        </a>
      ),
      useNavigate: () => mockNavigate,
    };
  },
  { virtual: true }
);

function renderWithUser(ui) {
  const value = {
    user: null,
    token: null,
    isLoading: false,
    t: {
      maintenanceTitle: "ただいまメンテナンス中です",
      maintenanceMessage: "ご不便をおかけして申し訳ございません。しばらくお待ちください。",
    },
    setToken: jest.fn(),
    setUser: jest.fn(),
    fetchUser: jest.fn(),
    logout: jest.fn(),
  };

  return render(
    <UserContext.Provider value={value}>
      <>{ui}</>
    </UserContext.Provider>
  );
}

describe("language selector removal", () => {
  test("login page is fixed in English and shows no language selector", () => {
    renderWithUser(<LoginPage />);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument();
    expect(screen.queryByTestId("language-selector")).not.toBeInTheDocument();
  });

  test("register page is fixed in English and keeps only the spoken language field", () => {
    renderWithUser(<RegisterPage />);

    expect(screen.getByRole("heading", { name: "Sign Up" })).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("Not selected")).toBeInTheDocument();
    expect(screen.queryByTestId("language-selector")).not.toBeInTheDocument();
  });

  test("maintenance page shows no language selector", () => {
    renderWithUser(<MaintenancePage />);

    expect(screen.getByText("ただいまメンテナンス中です")).toBeInTheDocument();
    expect(screen.queryByTestId("language-selector")).not.toBeInTheDocument();
  });

  test("header shows no language selector", () => {
    render(<Header isDrawerOpen={false} onToggleDrawer={jest.fn()} />);

    expect(screen.getByText("ShigaChat")).toBeInTheDocument();
    expect(screen.queryByTestId("language-selector")).not.toBeInTheDocument();
  });
});
