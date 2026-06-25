"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import Footer from "@/app/components/Footer";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

const CompanySidebar = dynamic(() => import("../components/CompanySidebar"), {
  ssr: false,
  loading: () => <div className="h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

type ApprovalItem = {
  _id: string;
  title?: string;
  status?: string;
  createdAt?: string;
  requester?: { _id: string; fullName?: string; email?: string } | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const badgeClass: Record<string, string> = {
  pending_company_approval: "bg-amber-100 text-amber-800",
  company_rejected: "bg-rose-100 text-rose-800",
  pending_platform_review: "bg-sky-100 text-sky-800",
  published: "bg-emerald-100 text-emerald-800",
};

export default function CompanyApprovalsPage() {
  const { token, user, loading } = useAuth("company");
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending_company_approval");
  const { notify } = useAppNotifier();

  const teamRole = useMemo(() => String(user?.companyTeamRole || "").toLowerCase(), [user?.companyTeamRole]);
  const isApprover = teamRole === "owner" || teamRole === "manager" || user?.role === "admin";

  const load = useCallback(async () => {
    if (!token) return;
    if (!isApprover) {
      setItems([]);
      setPagination(null);
      setError("");
      return;
    }
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: "12", status: statusFilter }).toString();
      const res = await authFetch<{ approvals: ApprovalItem[]; pagination: Pagination }>(`/companies/job-approvals?${query}`, token, {
        suppressGlobalErrors: true,
      });
      setItems(res.approvals || []);
      setPagination(res.pagination || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar aprovações.");
    }
  }, [token, isApprover, page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, decision: "approve" | "reject" | "request_changes") => {
    if (!token) return;
    const reason = decision === "approve" ? "" : window.prompt("Motivo da decisão:") || "";
    if (decision !== "approve" && !reason.trim()) return;

    const escalate = decision === "approve" ? window.confirm("Escalar para revisão de plataforma?") : false;

    setBusyId(id);
    setError("");
    try {
      await authFetch(`/companies/job-approvals/${id}/review`, token, {
        method: "PATCH",
        body: JSON.stringify({ decision, reason, escalateToPlatformReview: escalate }),
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao rever pedido.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="pt-8 px-6 pb-24 lg:pb-16 max-w-7xl mx-auto">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
          <CompanySidebar />

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold">Aprovações de vagas</h1>
                <p className="mt-1 text-sm text-slate-600">Revise pedidos de publicação da sua equipa antes da moderação da plataforma.</p>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="pending_company_approval">Pendentes</option>
                <option value="company_rejected">Rejeitadas</option>
                <option value="pending_platform_review">Escaladas à plataforma</option>
                <option value="published">Publicadas</option>
              </select>
            </div>

            {error ? <div className="mt-4"><InlineErrorState onAction={load} /></div> : null}

            {!isApprover && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Não tem permissão para aprovar pedidos de vagas. Contacte um owner/manager da empresa.
              </div>
            )}

            <div className="mt-5 grid gap-3">
              {items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
                  Não existem pedidos nesta fila.
                </div>
              )}
              {items.map((item) => {
                const status = String(item.status || "pending_company_approval");
                return (
                  <article key={item._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{item.title || "Pedido de vaga"}</p>
                        <p className="text-xs text-slate-500">
                          Solicitante: {item.requester?.fullName || "Desconhecido"} ({item.requester?.email || "sem email"})
                        </p>
                        <p className="text-xs text-slate-500">Criado em {item.createdAt ? new Date(item.createdAt).toLocaleString("pt-AO") : "--"}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass[status] || "bg-slate-100 text-slate-700"}`}>
                        {status}
                      </span>
                    </div>
                    {isApprover && status === "pending_company_approval" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          disabled={busyId === item._id}
                          onClick={() => review(item._id, "approve")}
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Aprovar
                        </button>
                        <button
                          disabled={busyId === item._id}
                          onClick={() => review(item._id, "request_changes")}
                          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                        >
                          Pedir alterações
                        </button>
                        <button
                          disabled={busyId === item._id}
                          onClick={() => review(item._id, "reject")}
                          className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          Rejeitar
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-sm text-slate-600">Página {page} de {pagination.totalPages}</span>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                  className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
                >
                  Seguinte
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
