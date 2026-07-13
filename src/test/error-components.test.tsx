import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BannerError from "@/app/components/errors/BannerError";
import FormFieldError from "@/app/components/errors/FormFieldError";
import ModalError from "@/app/components/errors/ModalError";
import ToastError from "@/app/components/errors/ToastError";
import FeedbackAlert from "@/app/components/errors/FeedbackAlert";

describe("Error UI components", () => {
  it("renders FormFieldError next to a field with alert semantics", () => {
    render(<FormFieldError id="email-error" message="Informe um email válido." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um email válido.");
  });

  it("renders ToastError with retry action", () => {
    const onDismiss = vi.fn();
    const onRetry = vi.fn();
    render(
      <ToastError
        id={1}
        title="Erro"
        message="Não foi possível concluir a operação."
        durationMs={5000}
        onDismiss={onDismiss}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir a operação.");
    screen.getByRole("button", { name: "Tentar novamente" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders BannerError with reconnect action", () => {
    const onAction = vi.fn();
    render(
      <BannerError
        title="Problema de ligação"
        message="A ligação foi interrompida."
        actionLabel="Reconectar"
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Problema de ligação");
    screen.getByRole("button", { name: "Reconectar" }).click();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("renders ModalError with support code for diagnostics", () => {
    render(
      <ModalError
        open
        title="Falha crítica"
        message="Não foi possível continuar."
        supportCode="REQ-123"
        onPrimary={() => undefined}
        onSecondary={() => undefined}
      />,
    );

    expect(screen.getByText("Falha crítica")).toBeInTheDocument();
    expect(screen.getByText("Código de suporte: REQ-123")).toBeInTheDocument();
  });

  it("renders the warning variant with amber accent styling and alert role", () => {
    render(<FeedbackAlert variant="warning" title="Atenção" message="Verifique os dados." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Atenção");
    expect(alert.className).toContain("border-l-amber-600");
    expect(alert.className).toContain("bg-amber-50");
  });
});
