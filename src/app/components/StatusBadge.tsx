type StatusBadgeProps = {
  status: string;
  size?: "sm" | "md";
};

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-amber-100", text: "text-amber-700" },
  approved: { bg: "bg-green-100", text: "text-green-700" },
  rejected: { bg: "bg-red-100", text: "text-red-700" },
  completed: { bg: "bg-blue-100", text: "text-blue-700" },
  active: { bg: "bg-green-100", text: "text-green-700" },
  inactive: { bg: "bg-slate-100", text: "text-slate-700" },
  draft: { bg: "bg-slate-100", text: "text-slate-700" },
  archived: { bg: "bg-slate-100", text: "text-slate-700" },
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  completed: "Concluído",
  active: "Ativo",
  inactive: "Inativo",
  draft: "Rascunho",
  archived: "Arquivado",
};

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const colors = statusColors[status.toLowerCase()] || statusColors.inactive;
  const label = statusLabels[status.toLowerCase()] || status;
  const sizeClass = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";

  return <span className={`inline-flex rounded-full font-semibold ${colors.bg} ${colors.text} ${sizeClass}`}>{label}</span>;
}
