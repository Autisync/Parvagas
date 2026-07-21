import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RefundDisclosureNotice from "@/app/Portal/components/RefundDisclosureNotice";

describe("RefundDisclosureNotice", () => {
  it("shows company-specific copy and links to /reembolsos", () => {
    render(<RefundDisclosureNotice audience="company" checked={false} onChange={() => {}} />);
    expect(screen.getByText(/não são reembolsáveis a partir do momento em que são ativados/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Política de Reembolsos/ })).toHaveAttribute("href", "/reembolsos");
  });

  it("shows candidate-specific 14-day cooling-off copy", () => {
    render(<RefundDisclosureNotice audience="candidate" checked={false} onChange={() => {}} />);
    expect(screen.getByText(/14 dias para pedir reembolso/)).toBeInTheDocument();
  });

  it("calls onChange when the checkbox is toggled", () => {
    const onChange = vi.fn();
    render(<RefundDisclosureNotice audience="company" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects the checked prop", () => {
    render(<RefundDisclosureNotice audience="company" checked={true} onChange={() => {}} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
