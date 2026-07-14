import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ParsedFieldsForm from "@/app/Portal/Candidato/CV-e-Documentos/components/ParsedFieldsForm";
import type { ParsedDraft } from "@/app/Portal/Candidato/CV-e-Documentos/components/types";

function renderForm(draft: ParsedDraft, overrides: Partial<React.ComponentProps<typeof ParsedFieldsForm>> = {}) {
  const onApprove = vi.fn();
  const setDraft = vi.fn();
  render(
    <ParsedFieldsForm
      draft={draft}
      setDraft={setDraft}
      missingSections={[]}
      parseWarning=""
      lowConfidenceFields={[]}
      cvMappedFields={[]}
      approving={false}
      onApprove={onApprove}
      onCancel={vi.fn()}
      existingSkills={[]}
      existingLanguages={[]}
      existingCertifications={[]}
      saveError=""
      onDismissSaveError={vi.fn()}
      {...overrides}
    />
  );
  return { onApprove, setDraft };
}

describe("CV e Documentos — ParsedFieldsForm error consistency", () => {
  it("blocks submission and renders an inline alert for an invalid email, focusing the field", () => {
    const { onApprove } = renderForm({ email: "not-an-email" });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar e guardar" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Introduza um email válido antes de guardar.");
    expect(document.activeElement).toBe(document.getElementById("draft-email"));
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("calls onApprove once the draft passes validation", () => {
    const { onApprove } = renderForm({ email: "candidata@example.com" });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar e guardar" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("shows a Portuguese low-confidence hint next to a mapped field instead of English filler text", () => {
    renderForm({ email: "candidata@example.com" }, { lowConfidenceFields: ["email"] });

    expect(screen.getByText("Confirme este valor — a extração automática teve baixa confiança.")).toBeInTheDocument();
    expect(screen.queryByText("Please check this field.")).not.toBeInTheDocument();
  });

  it("surfaces a save error coming from the API alongside client-side validation", () => {
    renderForm({ email: "candidata@example.com" }, { saveError: "Não foi possível guardar o perfil." });

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível guardar o perfil.");
  });
});
