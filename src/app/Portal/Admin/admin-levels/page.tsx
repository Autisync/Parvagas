"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import {
  fetchAdminMe,
  fetchUsers,
  statusBadgeClass,
  toDateLabel,
  type AdminLevel,
  type Pagination,
  type UserRecord,
} from "../adminClient";
import {
  AdminEmptyState,
  AdminFilterBar,
  AdminPageHeader,
  AdminRestricted,
  adminButtonClass,
  adminFieldClass,
  adminSecondaryButtonClass,
} from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

export default function AdminLevelsPage() {
  const { token } = useAuth("admin");
  const [level, setLevel] = useState<AdminLevel>("super-admin");
  const [admins, setAdmins] = useState<UserRecord[]>([]);
  const [adminLevelFilter, setAdminLevelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [createdMsg, setCreatedMsg] = useState("");
  const { notify } = useAppNotifier();
  const [newAdmin, setNewAdmin] = useState({
    fullName: "",
    email: "",
    adminLevel: "moderator" as AdminLevel,
    credentialDeliveryMode: "set_password_link" as "set_password_link" | "temporary_password",
  });

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [me, usersRes] = await Promise.all([
        fetchAdminMe(token),
        fetchUsers(token, {
          page,
          limit: 15,
          role: "admin",
          keyword: search,
          adminLevel: adminLevelFilter,
        }),
      ]);
      setLevel(me.adminLevel);
      setAdmins(usersRes.users || []);
      setPagination(usersRes.pagination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar admins.");
    }
  }, [token, page, search, adminLevelFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!createdMsg) return;
    notify(createdMsg, "success");
    setCreatedMsg("");
  }, [createdMsg, notify]);

  const changeLevel = async (id: string, adminLevel: AdminLevel) => {
    if (!token || level !== "super-admin") return;
    const reason = window.prompt(adminLevel === "super-admin" ? "Motivo da promoção:" : "Motivo da demissão para moderator:") || "";
    if (!reason.trim()) return;
    setBusy(id);
    setError("");
    try {
      await authFetch(`/admin/users/${id}/admin-level`, token, {
        method: "PATCH",
        body: JSON.stringify({ adminLevel, reason }),
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar adminLevel.");
    } finally {
      setBusy(null);
    }
  };

  const createAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || level !== "super-admin") return;
    setCreating(true);
    setError("");
    setCreatedMsg("");
    try {
      await authFetch("/admin/users/admin", token, {
        method: "POST",
        body: JSON.stringify(newAdmin),
      });
      setCreatedMsg("Admin criado e email de onboarding enviado. O utilizador terá de redefinir password no primeiro acesso.");
      setNewAdmin({ fullName: "", email: "", adminLevel: "moderator", credentialDeliveryMode: "set_password_link" });
      setPage(1);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar admin.");
    } finally {
      setCreating(false);
    }
  };

  if (level !== "super-admin") {
    return (
      <AdminRestricted title="Área super-admin">
        Apenas super-admin pode promover, demover ou criar contas administrativas.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Super-admin"
        title="Admins e Moderadores"
        description="Crie admins/moderadores, promova níveis administrativos e mantenha todas as alterações registadas em auditoria."
      />

      {error ? <div className="mt-4"><InlineErrorState /></div> : null}

      <form onSubmit={createAdmin} className="mt-5 app-card p-5">
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Criar acesso admin</h2>
            <p className="text-sm text-slate-600">A conta criada recebe uma password temporária e será obrigada a redefinir no primeiro login.</p>
          </div>
          <span className="w-fit rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">Super-admin only</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs text-slate-600">
            <span>Nome completo *</span>
            <input
              value={newAdmin.fullName}
              onChange={(e) => setNewAdmin((prev) => ({ ...prev, fullName: e.target.value }))}
              placeholder="Ex.: Maria dos Santos"
              className={adminFieldClass}
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>Email de acesso (para onde vão as credenciais) *</span>
            <input
              value={newAdmin.email}
              onChange={(e) => setNewAdmin((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="email@empresa.com"
              type="email"
              className={adminFieldClass}
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>Nível de acesso — moderador revê conteúdo; super-admin controla tudo</span>
            <select
              value={newAdmin.adminLevel}
              onChange={(e) => setNewAdmin((prev) => ({ ...prev, adminLevel: e.target.value as AdminLevel }))}
              className={adminFieldClass}
            >
              <option value="moderator">Moderator</option>
              <option value="super-admin">Super-admin</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>Como entregar as credenciais</span>
            <select
              value={newAdmin.credentialDeliveryMode}
              onChange={(e) => setNewAdmin((prev) => ({ ...prev, credentialDeliveryMode: e.target.value as "set_password_link" | "temporary_password" }))}
              className={adminFieldClass}
            >
              <option value="set_password_link">Link único para definir password (recomendado)</option>
              <option value="temporary_password">Enviar password temporária por email</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={creating}
          className={`mt-4 ${adminButtonClass}`}
        >
          {creating ? "A criar..." : "Criar admin/moderador"}
        </button>
      </form>

      <AdminFilterBar>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Pesquisar admin"
          className={`${adminFieldClass} md:col-span-2`}
        />
        <select
          value={adminLevelFilter}
          onChange={(e) => { setAdminLevelFilter(e.target.value); setPage(1); }}
          className={adminFieldClass}
        >
          <option value="all">Todos os níveis</option>
          <option value="super-admin">Super-admin</option>
          <option value="moderator">Moderator</option>
        </select>
      </AdminFilterBar>

      <div className="mt-5 grid gap-3">
        {admins.length === 0 && <AdminEmptyState title="Sem admins nesta vista" description="Ajuste a pesquisa ou crie um novo acesso administrativo." />}
        {admins.map((admin) => {
          const current = admin.adminLevel === "moderator" ? "moderator" : "super-admin";
          return (
            <div key={admin._id} className="app-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{admin.fullName || "Admin"}</p>
                  <p className="text-sm text-slate-600">{admin.email || "Sem email"}</p>
                  <p className="text-xs text-slate-500">Criado em {toDateLabel(admin.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(current)}`}>
                    {current}
                  </span>
                  <button
                    disabled={busy === admin._id || current === "super-admin"}
                    onClick={() => changeLevel(admin._id, "super-admin")}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Promover
                  </button>
                  <button
                    disabled={busy === admin._id || current === "moderator"}
                    onClick={() => changeLevel(admin._id, "moderator")}
                    className={`${adminSecondaryButtonClass} px-3 py-2 text-xs disabled:opacity-40`}
                  >
                    Demover
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <PaginationControls pagination={pagination} onPage={setPage} />
    </div>
  );
}
