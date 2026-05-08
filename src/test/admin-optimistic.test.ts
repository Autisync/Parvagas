import { describe, expect, it } from "vitest";
import {
  buildCompanyStatusPayload,
  normalizeCompanyStatusInput,
  requiresReasonForCompanyStatus,
  updateItemsByIds,
} from "@/app/Portal/Admin/utils/optimistic";

describe("admin optimistic utilities", () => {
  it("updates selected list items optimistically", () => {
    const before = [
      { _id: "a", status: "pending" },
      { _id: "b", status: "pending" },
    ];

    const after = updateItemsByIds(before, ["b"], (item) => ({ ...item, status: "active" }));

    expect(after[0].status).toBe("pending");
    expect(after[1].status).toBe("active");
  });

  it("requires reason for rejected and inactive status", () => {
    expect(requiresReasonForCompanyStatus("rejected")).toBe(true);
    expect(requiresReasonForCompanyStatus("inactive")).toBe(true);
    expect(requiresReasonForCompanyStatus("active")).toBe(false);
  });

  it("builds payload for valid status changes", () => {
    const payload = buildCompanyStatusPayload("active", "");
    expect(payload).toEqual({ status: "active", reason: "" });
  });

  it("normalizes friendly and localized company status inputs", () => {
    expect(normalizeCompanyStatusInput("pendente")).toBe("pending_verification");
    expect(normalizeCompanyStatusInput("pending")).toBe("pending_verification");
    expect(normalizeCompanyStatusInput("ativa")).toBe("active");
    expect(normalizeCompanyStatusInput("rejeitada")).toBe("rejected");
    expect(normalizeCompanyStatusInput("inativa")).toBe("inactive");
  });

  it("builds normalized payload for localized statuses", () => {
    expect(buildCompanyStatusPayload("pendente", "")).toEqual({
      status: "pending_verification",
      reason: "",
    });
  });

  it("throws when reason is missing for destructive company decisions", () => {
    expect(() => buildCompanyStatusPayload("rejected", "")).toThrow();
    expect(() => buildCompanyStatusPayload("inactive", "   ")).toThrow();
  });
});
