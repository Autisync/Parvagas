"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/api";

type ThreadMessage = {
  _id: string;
  senderUserId?: string;
  senderRole: "company" | "candidate";
  body: string;
  readAt?: string | null;
  createdAt?: string;
};

type Props = {
  token: string;
  applicationId: string;
  /** Which side of the conversation the current viewer is on. */
  viewerRole: "company" | "candidate";
  /** Company-side "viewer" team-role seats can read but not send — the
   * candidate side is always sendable once the thread is visible at all
   * (the company must have sent first, gated upstream by the caller). */
  canSend?: boolean;
  open: boolean;
  onClose: () => void;
  /** Fired after messages are marked read, so the caller can refresh its
   * own unread-count badge. */
  onRead?: () => void;
};

const MAX_LENGTH = 2000;

export default function MessageThreadModal({
  token, applicationId, viewerRole, canSend = true, open, onClose, onRead,
}: Props) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    authFetch<{ messages: ThreadMessage[] }>(`/applications/${applicationId}/messages`, token)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages || []);
        // Mark read once the thread is actually open — best-effort, no need
        // to block rendering on it.
        authFetch(`/applications/${applicationId}/messages/read`, token, { method: "PATCH" })
          .then(() => onRead?.())
          .catch(() => null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar mensagens.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, applicationId, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  if (!open) return null;

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError("");
    try {
      const data = await authFetch<{ message: ThreadMessage }>(`/applications/${applicationId}/messages`, token, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setMessages((prev) => [...prev, data.message]);
      setDraft("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3">
          <h3 className="text-base font-bold text-slate-900">Mensagens</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-500">A carregar...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-500">Sem mensagens ainda.</p>
          ) : (
            messages.map((m) => {
              const isOwn = m.senderRole === viewerRole;
              return (
                <div key={m._id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      isOwn ? "bg-red-600 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {m.createdAt && (
                      <p className={`mt-1 text-[10px] ${isOwn ? "text-red-100" : "text-slate-500"}`}>
                        {new Date(m.createdAt).toLocaleString("pt-AO")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="px-5 pb-2 text-sm text-red-600">{error}</p>}

        {canSend ? (
          <div className="border-t border-slate-100 px-5 py-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              maxLength={MAX_LENGTH}
              placeholder="Escreva a sua mensagem..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-slate-400">{draft.length}/{MAX_LENGTH}</span>
              <button
                type="button"
                onClick={send}
                disabled={sending || !draft.trim()}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {sending ? "A enviar..." : "Enviar"}
              </button>
            </div>
          </div>
        ) : (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Apenas leitura — só o owner ou recrutadores podem enviar mensagens.
          </p>
        )}
      </div>
    </div>
  );
}
