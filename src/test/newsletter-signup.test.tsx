import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import NewsletterSignup from "@/app/components/NewsletterSignup";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/recaptcha", () => ({
  getRecaptchaToken: vi.fn().mockResolvedValue("captcha-token"),
}));

describe("NewsletterSignup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the entered email to the subscribe endpoint and shows a success message", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ message: "ok" });
    render(<NewsletterSignup />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Subscrever" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/newsletter/subscribe",
        expect.objectContaining({
          method: "POST",
          headers: { "x-captcha-token": "captcha-token" },
        }),
      );
    });

    const [, options] = vi.mocked(apiFetch).mock.calls[0];
    expect(JSON.parse((options as { body: string }).body)).toEqual({
      email: "pessoa@exemplo.com",
      source: "footer",
    });

    expect(await screen.findByText("Subscrição confirmada. Obrigado!")).toBeInTheDocument();
  });

  it("shows an error message when the subscribe request fails", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Serviço indisponível."));
    render(<NewsletterSignup />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Subscrever" }));

    expect(await screen.findByText("Serviço indisponível.")).toBeInTheDocument();
  });

  it("does not submit when the email field is empty", () => {
    render(<NewsletterSignup />);
    fireEvent.click(screen.getByRole("button", { name: "Subscrever" }));
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
