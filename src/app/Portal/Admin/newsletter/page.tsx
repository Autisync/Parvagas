"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { getErrorMessage } from "@/lib/api";
import {
  createNewsletterIssue,
  fetchAdminMe,
  fetchNewsletterIssues,
  fetchNewsletterSubscribers,
  sendNewsletterIssue,
  type AdminMe,
  type NewsletterIssueRecord,
  type NewsletterSubscriberRecord,
} from "../adminClient";
import {
  AdminAlert,
  AdminEmptyState,
  AdminModal,
  AdminPageHeader,
  AdminSpinner,
  adminButtonClass,
  adminFieldClass,
  adminSecondaryButtonClass,
} from "../components/AdminUI";

const emptyForm = {
  subject: "",
  introText: "",
  includeRecentJobs: false,
  recentJobsCount: 5,
};

type IssueForm = typeof emptyForm;

const STATUS_LABEL: Record<NewsletterIssueRecord["status"], string> = {
  draft: "Rascunho",
  sending: "A enviar",
  sent: "Enviada",
  failed: "Falhou",
};

const STATUS_CLASS: Record<NewsletterIssueRecord["status"], string> = {
  draft: "bg-slate-100 text-slate-600",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
};

export default function AdminNewsletterPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();

  const [me, setMe] = useState<AdminMe | null>(null);
  const [subscribers, setSubscribers] = useState<{ active: number; unsubscribed: number } | null>(null);
  const [issues, setIssues] = useState<NewsletterIssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<IssueForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendTarget, setSendTarget] = useState<NewsletterIssueRecord | null>(null);
  const [sending, setSending] = useState(false);

  const isSuperAdmin = me?.adminLevel === "super-admin";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [currentAdmin, subs, issueList] = await Promise.all([
        fetchAdminMe(token),
        fetchNewsletterSubscribers(token),
        fetchNewsletterIssues(token),
      ]);
      setMe(currentAdmin);
      setSubscribers({ active: subs.activeCount, unsubscribed: subs.unsubscribedCount });
      setIssues(issueList.issues);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar a newsletter."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = () => {
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!token) return;
    const subject = form.subject.trim();
    const paragraphs = form.introText.split("\n\n").map((p) => p.trim()).filter(Boolean);
    if (!subject || paragraphs.length === 0) {
      setFormError("Indique um assunto e pelo menos um parágrafo.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await createNewsletterIssue(token, {
        subject,
        introParagraphs: paragraphs,
        includeRecentJobs: form.includeRecentJobs,
        recentJobsCount: form.recentJobsCount,
      });
      setModalOpen(false);
      notify("Rascunho de newsletter criado.", "success");
      load();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "Não foi possível criar a newsletter."));
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!token || !sendTarget) return;
    setSending(true);
    try {
      await sendNewsletterIssue(token, sendTarget._id);
      notify("Newsletter em envio para os subscritores ativos.", "success");
      setSendTarget(null);
      load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível enviar a newsletter."), "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Conteúdo & Marketing"
        title="Newsletter"
        description="Componha e envie uma newsletter para os subscritores ativos, ou reveja o histórico de envios."
        action={
          <button type="button" onClick={openModal} className={adminButtonClass}>
            Nova newsletter
          </button>
        }
      />

      {error && <AdminAlert tone="error">{error}</AdminAlert>}

      {loading ? (
        <div className="flex justify-center py-16"><AdminSpinner size="md" /></div>
      ) : (
        <>
          <section className="app-card p-5">
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-2xl font-bold text-[var(--text-strong)]">{subscribers?.active ?? "—"}</p>
                <p className="text-sm text-[var(--text-muted)]">Subscritores ativos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-strong)]">{subscribers?.unsubscribed ?? "—"}</p>
                <p className="text-sm text-[var(--text-muted)]">Cancelaram a subscrição</p>
              </div>
            </div>
            {!isSuperAdmin && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Apenas super-admin pode enviar uma newsletter aos subscritores — pode criar rascunhos normalmente.
              </p>
            )}
          </section>

          <section className="app-card p-5">
            <h2 className="text-base font-bold text-[var(--text-strong)]">Newsletters</h2>
            {issues.length === 0 ? (
              <div className="mt-4">
                <AdminEmptyState title="Nenhuma newsletter ainda" description="Crie um rascunho para começar." />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {issues.map((issue) => (
                  <div
                    key={issue._id}
                    className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-strong)]">{issue.subject}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[issue.status]}`}>
                          {STATUS_LABEL[issue.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {issue.sentAt
                          ? `Enviada em ${new Date(issue.sentAt).toLocaleString("pt-PT")} — ${issue.queuedCount ?? 0} destinatários`
                          : "Ainda não enviada"}
                      </p>
                    </div>
                    {issue.status === "draft" && isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => setSendTarget(issue)}
                        className={adminButtonClass}
                      >
                        Enviar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <AdminModal
        open={modalOpen}
        title="Nova newsletter"
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className={adminSecondaryButtonClass}>
              Cancelar
            </button>
            <button type="button" onClick={handleCreate} disabled={saving} className={adminButtonClass}>
              {saving ? "A guardar..." : "Guardar rascunho"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && <AdminAlert tone="error">{formError}</AdminAlert>}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Assunto *</label>
            <input
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Novidades desta semana no Parvagas"
              className={adminFieldClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Texto de introdução * <span className="font-normal text-slate-400">(um parágrafo por linha em branco)</span>
            </label>
            <textarea
              value={form.introText}
              onChange={(e) => setForm((p) => ({ ...p, introText: e.target.value }))}
              rows={6}
              placeholder={"Olá!\n\nEsta semana temos novidades na plataforma…"}
              className={adminFieldClass}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="include-recent-jobs"
              type="checkbox"
              checked={form.includeRecentJobs}
              onChange={(e) => setForm((p) => ({ ...p, includeRecentJobs: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <label htmlFor="include-recent-jobs" className="text-sm text-slate-700">Incluir vagas recentes</label>
          </div>
          {form.includeRecentJobs && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Número de vagas a mostrar</label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.recentJobsCount}
                onChange={(e) => setForm((p) => ({ ...p, recentJobsCount: Number(e.target.value) || 5 }))}
                className={`${adminFieldClass} max-w-[120px]`}
              />
            </div>
          )}
        </div>
      </AdminModal>

      <AdminModal
        open={Boolean(sendTarget)}
        title="Enviar newsletter"
        onClose={() => setSendTarget(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setSendTarget(null)} className={adminSecondaryButtonClass}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {sending ? "A enviar..." : "Enviar definitivamente"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Vai enviar <strong>&ldquo;{sendTarget?.subject}&rdquo;</strong> para {subscribers?.active ?? 0} subscritores ativos.
          Esta ação não pode ser desfeita.
        </p>
      </AdminModal>
    </div>
  );
}
