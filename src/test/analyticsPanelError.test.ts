import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { describeAnalyticsPanelError } from "@/app/Portal/Admin/components/analyticsPanelError";

describe("describeAnalyticsPanelError", () => {
  it("maps a 404 ApiError to a backend-version message", () => {
    const err = new ApiError("not found", { status: 404 });
    expect(describeAnalyticsPanelError(err)).toBe("Este painel requer uma versão mais recente do backend.");
  });

  it("maps a network-error ApiError to a connectivity message", () => {
    const err = new ApiError("network failure", { isNetworkError: true });
    expect(describeAnalyticsPanelError(err)).toBe("Sem ligação ao servidor.");
  });

  it("falls back to a generic message for other ApiError statuses", () => {
    const err = new ApiError("server error", { status: 500 });
    expect(describeAnalyticsPanelError(err)).toBe("Não foi possível carregar esta informação.");
  });

  it("falls back to a generic message for a plain Error", () => {
    expect(describeAnalyticsPanelError(new Error("boom"))).toBe("Não foi possível carregar esta informação.");
  });

  it("falls back to a generic message for a non-Error value", () => {
    expect(describeAnalyticsPanelError("weird")).toBe("Não foi possível carregar esta informação.");
  });
});
