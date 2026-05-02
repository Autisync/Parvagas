import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SignUpPage from "@/app/Signup/page";

vi.mock("@/app/components/AppNotifier", () => ({
  useAppNotifier: () => ({
    notify: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams("role=candidate"),
  };
});

describe("Signup integration flow", () => {
  it("shows validation errors only after interaction and preserves typed values", async () => {
    render(<SignUpPage />);

    const fullNameInput = screen.getByLabelText("Nome completo");
    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Palavra-passe");
    const confirmPasswordInput = screen.getByLabelText("Confirmar palavra-passe");

    expect(screen.queryByText("Preencha nome, email e palavra-passe.")).not.toBeInTheDocument();

    fireEvent.change(fullNameInput, { target: { value: "Maria Silva" } });
    fireEvent.change(emailInput, { target: { value: "maria@empresa.ao" } });

    fireEvent.blur(confirmPasswordInput);
    fireEvent.change(passwordInput, { target: { value: "senha123" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "diferente" } });

    expect(screen.getByText("As palavras-passe não coincidem.")).toBeInTheDocument();

    expect(fullNameInput).toHaveValue("Maria Silva");
    expect(emailInput).toHaveValue("maria@empresa.ao");
    expect(passwordInput).toHaveValue("senha123");
  });
});
