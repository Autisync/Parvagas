import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CookieConsent from "@/app/components/CookieConsent";
import { apiFetch } from "@/lib/api";
import { getCookieConsent } from "@/lib/cookieConsent";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("CookieConsent banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(apiFetch).mockResolvedValue({ versionLabel: "2026-07" });
  });

  it("shows the banner for a first-time visitor", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: "Preferências de cookies" })).toBeInTheDocument();
  });

  it("does not show the banner once a decision is already stored", () => {
    localStorage.setItem(
      "parvagas_cookie_consent",
      JSON.stringify({ analytics: true, policyVersion: "2026-07", decidedAt: new Date(0).toISOString() })
    );
    render(<CookieConsent />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("accepting all records analytics consent and hides the banner", async () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Aceitar todos" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(getCookieConsent()?.analytics).toBe(true));
  });

  it("rejecting optional records analytics as declined", async () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Recusar opcionais" }));

    await waitFor(() => expect(getCookieConsent()?.analytics).toBe(false));
  });

  it("personalizing reveals the analytics checkbox, unchecked by default", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Personalizar" }));

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("saving preferences with the checkbox on records analytics consent", async () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Personalizar" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar preferências" }));

    await waitFor(() => expect(getCookieConsent()?.analytics).toBe(true));
  });

  it("reopens via the global event even after a decision was already made", async () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Aceitar todos" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent(window, new Event("parvagas:open-cookie-preferences"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
