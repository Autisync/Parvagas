"use client";

import { useEffect, useState } from "react";
import Footer from "@/app/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import { useToasts } from "../components/useToasts";
import FormFieldError from "@/app/components/errors/FormFieldError";
import BannerError from "@/app/components/errors/BannerError";

type TeamMember = {
  _id: string;
  fullName?: string;
  email?: string;
  companyTeamRole?: "owner" | "recruiter" | "viewer";
};

type TeamInvite = {
  _id: string;
  email?: string;
  teamRole?: "owner" | "recruiter" | "viewer";
  status?: "pending" | "accepted" | "revoked" | "expired";
  expiresAt?: string;
  token?: string;
};

export default function EmpresaUtilizadoresPage() {
  const { token, loading, user } = useAuth("company");
  const [fetching, setFetching] = useState(true);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [inviting, setInviting] = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [pageError, setPageError] = useState("");
  const [memberActionModal, setMemberActionModal] = useState<null | {
    type: "remove" | "downgrade";
    member: TeamMember;
    nextRole?: "recruiter" | "viewer";
  }>(null);
  const [removeConfirmationText, setRemoveConfirmationText] = useState("");
  const [inviteSubmitted, setInviteSubmitted] = useState(false);
  const [invite, setInvite] = useState({
    email: "",
    teamRole: "recruiter" as "owner" | "recruiter" | "viewer",
    expiresInDays: 7,
  });
  const { pushToast } = useToasts();

  useEffect(() => {
    if (!token) return;
    Promise.all([
      authFetch<{ members: TeamMember[]; ownerUserId: string }>("/companies/team", token),
      authFetch<{ invites: TeamInvite[] }>("/companies/team/invites", token),
    ])
      .then(([teamData, invitesData]) => {
        setTeamMembers(teamData.members || []);
        setOwnerUserId(teamData.ownerUserId || "");
        setTeamInvites(invitesData.invites || []);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Erro ao carregar equipa.";
        setPageError(message);
        pushToast("error", message);
      })
      .finally(() => setFetching(false));
  }, [token, pushToast]);

  useEffect(() => {
    if (!pageError) return;
    pushToast("error", pageError);
  }, [pageError, pushToast]);

  const currentUserId = String(
    (user as { id?: string; _id?: string } | null)?.id ||
      (user as { id?: string; _id?: string } | null)?._id ||
      ""
  );
  const isOwner = Boolean(currentUserId && currentUserId === String(ownerUserId));

  const updateMemberRole = async (memberId: string, nextRole: "recruiter" | "viewer") => {
    if (!token) return false;
    setUpdatingMemberId(memberId);
    try {
      const data = await authFetch<{ member: TeamMember }>(`/companies/team/members/${memberId}/role`, token, {
        method: "PATCH",
        body: JSON.stringify({ teamRole: nextRole }),
      });
      setTeamMembers((prev) => prev.map((member) => (member._id === memberId ? { ...member, ...data.member } : member)));
      pushToast("success", "Role do membro atualizada.");
      return true;
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "Erro ao atualizar role.");
      return false;
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!token) return false;
    setRemovingMemberId(memberId);
    try {
      await authFetch(`/companies/team/members/${memberId}`, token, { method: "DELETE" });
      setTeamMembers((prev) => prev.filter((member) => member._id !== memberId));
      pushToast("info", "Membro removido da empresa.");
      return true;
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "Erro ao remover membro.");
      return false;
    } finally {
      setRemovingMemberId(null);
    }
  };

  const requestMemberRoleChange = (member: TeamMember, nextRole: "recruiter" | "viewer") => {
    const currentRole = member.companyTeamRole || "recruiter";
    if (currentRole === nextRole) return;
    if (currentRole === "recruiter" && nextRole === "viewer") {
      setRemoveConfirmationText("");
      setMemberActionModal({ type: "downgrade", member, nextRole });
      return;
    }
    void updateMemberRole(member._id, nextRole);
  };

  const requestRemoveMember = (member: TeamMember) => {
    setRemoveConfirmationText("");
    setMemberActionModal({ type: "remove", member });
  };

  const confirmMemberAction = async () => {
    if (!memberActionModal) return;
    if (memberActionModal.type === "remove") {
      const ok = await removeMember(memberActionModal.member._id);
      if (ok) {
        setMemberActionModal(null);
        setRemoveConfirmationText("");
      }
      return;
    }
    const role = memberActionModal.nextRole;
    if (!role) {
      setMemberActionModal(null);
      return;
    }
    const ok = await updateMemberRole(memberActionModal.member._id, role);
    if (ok) {
      setMemberActionModal(null);
      setRemoveConfirmationText("");
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSubmitted(true);
    if (!token) return;
    if (!invite.email.trim()) {
      pushToast("error", "Preencha o email para convidar o membro.");
      return;
    }
    setInviting(true);
    try {
      const data = await authFetch<{ invite: TeamInvite; emailDelivery?: { status?: string; error?: string } }>("/companies/team/invite", token, {
        method: "POST",
        body: JSON.stringify({
          email: invite.email.trim().toLowerCase(),
          teamRole: invite.teamRole,
          expiresInDays: invite.expiresInDays,
        }),
      });
      setTeamInvites((prev) => [data.invite, ...prev]);
      setInvite({ email: "", teamRole: "recruiter", expiresInDays: 7 });
      if (data.emailDelivery?.status === "sent") {
        pushToast("success", "Convite enviado por email com sucesso.");
      } else if (data.emailDelivery?.status === "failed") {
        pushToast("error", data.emailDelivery.error || "Convite criado, mas falhou o envio por email.");
      } else {
        pushToast("info", "Convite criado. O envio por email está indisponível no ambiente atual.");
      }
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "Erro ao criar convite.");
    } finally {
      setInviting(false);
    }
  };

  const resendInvite = async (inviteId: string) => {
    if (!token) return;
    setResendingInviteId(inviteId);
    try {
      const data = await authFetch<{ invite: TeamInvite; emailDelivery?: { status?: string; error?: string } }>(`/companies/team/invites/${inviteId}/resend`, token, { method: "POST" });
      setTeamInvites((prev) => prev.map((item) => (item._id === inviteId ? data.invite : item)));
      if (data.emailDelivery?.status === "sent") {
        pushToast("success", "Convite reenviado por email.");
      } else if (data.emailDelivery?.status === "failed") {
        pushToast("error", data.emailDelivery.error || "Convite atualizado, mas falhou o envio por email.");
      } else {
        pushToast("info", "Convite reenviado com novo prazo.");
      }
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "Erro ao reenviar convite.");
    } finally {
      setResendingInviteId(null);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!token) return;
    setRevokingInviteId(inviteId);
    try {
      const data = await authFetch<{ invite: TeamInvite }>(`/companies/team/invites/${inviteId}/revoke`, token, { method: "POST" });
      setTeamInvites((prev) => prev.map((item) => (item._id === inviteId ? data.invite : item)));
      pushToast("info", "Convite revogado.");
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "Erro ao revogar convite.");
    } finally {
      setRevokingInviteId(null);
    }
  };

  const inviteLinkForToken = (tokenValue: string) => `${window.location.origin}/Signup?role=company&inviteToken=${tokenValue}`;

  const copyInviteLink = async (tokenValue: string) => {
    try {
      await navigator.clipboard.writeText(inviteLinkForToken(tokenValue));
      pushToast("success", "Link do convite copiado.");
    } catch {
      pushToast("error", "Não foi possível copiar o link do convite.");
    }
  };

  if (loading || fetching) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-6 pb-24 lg:pb-16 pt-8">
        <section>
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-red-600">Gestão da equipa</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Utilizadores da empresa</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Convide membros, ajuste roles e remova acessos da conta empresarial principal.</p>
          </div>

          {pageError && (
            <div className="mb-6">
              <BannerError
                title="Não foi possível carregar os utilizadores"
                message={pageError}
                actionLabel="Reconectar"
                onAction={() => window.location.reload()}
              />
            </div>
          )}

          {!isOwner ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-lg font-bold text-amber-900">Acesso reservado ao owner</h2>
              <p className="mt-2 text-sm text-amber-800">Só a conta principal da empresa pode gerir utilizadores, convites e remoções de acesso.</p>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold text-slate-900">Membros da equipa</h2>
                <p className="mt-1 text-sm text-slate-600">Defina quem pode editar vagas e quem fica apenas com acesso de consulta.</p>

                <div className="mt-4 space-y-2">
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-slate-500">Sem membros associados ainda.</p>
                  ) : (
                    teamMembers.map((member) => (
                      <div key={member._id} className="rounded-xl border border-slate-100 px-3 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{member.fullName || "Utilizador"} <span className="text-xs font-medium text-slate-500">({member.companyTeamRole || "recruiter"})</span></p>
                            <p className="text-xs text-slate-500">{member.email || "--"}</p>
                          </div>
                          {member._id !== ownerUserId && (
                            <div className="flex items-center gap-2">
                              <select
                                value={member.companyTeamRole || "recruiter"}
                                onChange={(e) => requestMemberRoleChange(member, e.target.value as "recruiter" | "viewer")}
                                disabled={updatingMemberId === member._id || removingMemberId === member._id}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                              >
                                <option value="recruiter">Recruiter</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => requestRemoveMember(member)}
                                disabled={removingMemberId === member._id || updatingMemberId === member._id}
                                className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                              >
                                Remover
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold text-slate-900">Convidar utilizador</h2>
                <p className="mt-1 text-sm text-slate-600">Crie convites com prazo de validade e envio direto por email.</p>

                <form onSubmit={handleInviteMember} className="mt-4 grid gap-3 md:grid-cols-4">
                  <input
                    value={invite.email}
                    onChange={(e) => setInvite((prev) => ({ ...prev, email: e.target.value }))}
                    onBlur={() => setInviteSubmitted(true)}
                    placeholder="email@empresa.com"
                    type="email"
                    aria-invalid={Boolean(inviteSubmitted && !invite.email.trim())}
                    aria-describedby="invite-email-error"
                    className="app-input md:col-span-2"
                  />
                  <div className="md:col-span-2">
                    <FormFieldError id="invite-email-error" message={inviteSubmitted && !invite.email.trim() ? "Preencha o email para convidar o membro." : ""} />
                  </div>
                  <select
                    value={invite.teamRole}
                    onChange={(e) => setInvite((prev) => ({ ...prev, teamRole: e.target.value as "owner" | "recruiter" | "viewer" }))}
                    className="app-input"
                  >
                    <option value="recruiter">Recruiter</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <select
                    value={invite.expiresInDays}
                    onChange={(e) => setInvite((prev) => ({ ...prev, expiresInDays: Number(e.target.value) }))}
                    className="app-input"
                  >
                    <option value={3}>Expira em 3 dias</option>
                    <option value={7}>Expira em 7 dias</option>
                    <option value={14}>Expira em 14 dias</option>
                  </select>
                  <div className="md:col-span-4">
                    <button
                      type="submit"
                      disabled={inviting}
                      className="app-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {inviting ? "A criar convite..." : "Criar convite"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold text-slate-900">Convites pendentes e histórico</h2>
                <p className="mt-1 text-sm text-slate-600">Copie links, reenvie convites e revogue acessos ainda não aceites.</p>

                <div className="mt-4 space-y-2">
                  {teamInvites.length === 0 ? (
                    <p className="text-sm text-slate-500">Sem convites registados.</p>
                  ) : (
                    teamInvites.map((item) => (
                      <div key={item._id} className="rounded-xl border border-slate-100 px-3 py-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.email} <span className="text-xs text-slate-500">({item.teamRole || "recruiter"})</span></p>
                            <p className="text-xs text-slate-500">Status: {item.status || "pending"} · expira {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString("pt-AO") : "--"}</p>
                            {item.token && <p className="text-xs text-slate-500 break-all">Link: {inviteLinkForToken(item.token)}</p>}
                          </div>
                          {item.status === "pending" && (
                            <div className="flex flex-wrap gap-2">
                              {item.token && (
                                <button type="button" onClick={() => copyInviteLink(item.token!)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Copiar link</button>
                              )}
                              {item.token && (
                                <a
                                  href={`mailto:${item.email || ""}?subject=Convite%20Parvagas&body=Use%20este%20link%20para%20aceitar%20o%20convite:%20${encodeURIComponent(inviteLinkForToken(item.token))}`}
                                  className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                >
                                  Enviar email
                                </a>
                              )}
                              <button type="button" onClick={() => resendInvite(item._id)} disabled={resendingInviteId === item._id} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Reenviar</button>
                              <button type="button" onClick={() => revokeInvite(item._id)} disabled={revokingInviteId === item._id} className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Revogar</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </section>

        {memberActionModal && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
            onClick={() => {
              setMemberActionModal(null);
              setRemoveConfirmationText("");
            }}
          >
            <div
              className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900">
                {memberActionModal.type === "remove" ? "Confirmar remoção de membro" : "Confirmar downgrade de permissões"}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {memberActionModal.type === "remove"
                  ? `Vai remover ${memberActionModal.member.fullName || memberActionModal.member.email || "este membro"} da equipa da empresa.`
                  : `Vai reduzir a role de ${memberActionModal.member.fullName || memberActionModal.member.email || "este membro"} para Viewer.`}
              </p>
              {memberActionModal.type === "downgrade" && (
                <p className="mt-2 text-xs text-amber-700">Esta ação remove permissões de edição/publicação de vagas.</p>
              )}
              {memberActionModal.type === "remove" && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Digite REMOVER para confirmar
                  </label>
                  <input
                    value={removeConfirmationText}
                    onChange={(e) => setRemoveConfirmationText(e.target.value)}
                    placeholder="REMOVER"
                    aria-invalid={removeConfirmationText.trim() !== "REMOVER"}
                    aria-describedby="remove-confirm-error"
                    className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500"
                  />
                  <FormFieldError id="remove-confirm-error" message={removeConfirmationText.trim() !== "REMOVER" ? "Digite exatamente REMOVER para confirmar a ação." : ""} />
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMemberActionModal(null);
                    setRemoveConfirmationText("");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmMemberAction}
                  disabled={memberActionModal.type === "remove" && removeConfirmationText.trim() !== "REMOVER"}
                  className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}