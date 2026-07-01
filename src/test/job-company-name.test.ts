import { describe, expect, it } from "vitest";
import { companyName, type Job } from "@/app/Vagas-Disponiveis/page";

function job(over: Partial<Job>): Job {
  return { _id: "job-1", title: "Engenheiro", ...over };
}

describe("companyName", () => {
  it("prefers the real hiring company for aggregated/scraped jobs", () => {
    const j = job({
      externalCompanyName: "Empresa Real Lda",
      companyId: { name: "Parvagas Aggregator", verified: true },
    });
    expect(companyName(j)).toBe("Empresa Real Lda");
  });

  it("falls back to the populated company name when not aggregated", () => {
    const j = job({ companyId: { name: "Acme Lda" } });
    expect(companyName(j)).toBe("Acme Lda");
  });

  it("falls back to a generic label when no company data is present", () => {
    expect(companyName(job({}))).toBe("Empresa");
    expect(companyName(job({ companyId: "co-id-only" }))).toBe("Empresa");
  });
});
