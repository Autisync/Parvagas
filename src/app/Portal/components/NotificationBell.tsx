"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/api";
import { BellIcon } from "@heroicons/react/24/outline";

type NotificationItem = {
  _id: string;
  title?: string;
  description?: string;
  type?: string;
  readAt?: string | null;
  resolvedAt?: string | null;
  createdAt?: string;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
  page: number;
  total: number;
};

type Props = {
  token: string;
  role: "company" | "candidate" | "admin";
  teamRole?: string;
};

export default function NotificationBell({ token, role, teamRole }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageReason, setMessageReason] = useState("Solicitar aprovação de vaga");
  const [message, setMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const nonOwnerCompanyUser = role === "company" && teamRole && teamRole !== "owner";

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authFetch<NotificationsResponse>("/notifications?limit=10", token, {
        suppressGlobalErrors: true,
      });
      setItems(data.notifications || []);
      setUnreadCount(Number(data.unreadCount || 0));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications().catch(() => null);
    const timer = window.setInterval(() => {
      fetchNotifications().catch(() => null);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [fetchNotifications]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unresolved = useMemo(
    () => items.filter((item) => !item.resolvedAt),
    [items]
  );

  const markRead = async (id: string, read: boolean) => {
    await authFetch(`/notifications/${id}/${read ? "read" : "unread"}`, token, {
      method: "PATCH",
      suppressGlobalErrors: true,
    });
    await fetchNotifications();
  };

  const resolveNotification = async (id: string) => {
    await authFetch(`/notifications/${id}/resolve`, token, {
      method: "PATCH",
      suppressGlobalErrors: true,
    });
    await fetchNotifications();
  };

  const sendInternalMessage = async () => {
    if (!message.trim()) return;
    setSendingMessage(true);
    try {
      await authFetch("/notifications/company-admin-message", token, {
        method: "POST",
        body: JSON.stringify({ reason: messageReason, message: message.trim() }),
      });
      setMessage("");
      setMessageReason("Solicitar aprovação de vaga");
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) fetchNotifications().catch(() => null);
        }}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
        aria-label="Notificações"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-red-600 px-1 py-0.5 text-center text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Notificações</p>
            <span className="text-xs text-slate-500">{unreadCount} não lidas</span>
          </div>

          <div className="max-h-72 space-y-2 overflow-auto pr-1">
            {loading ? (
              <p className="text-sm text-slate-500">A carregar...</p>
            ) : unresolved.length === 0 ? (
              <p className="text-sm text-slate-500">Sem notificações pendentes.</p>
            ) : (
              unresolved.map((item) => (
                <div key={item._id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-sm font-semibold text-slate-900">{item.title || "Notificação"}</p>
                  <p className="mt-1 text-xs text-slate-600">{item.description || ""}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => markRead(item._id, !item.readAt).catch(() => null)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      {item.readAt ? "Marcar não lida" : "Marcar lida"}
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveNotification(item._id).catch(() => null)}
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                    >
                      Resolver
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {nonOwnerCompanyUser && (
            <div className="mt-3 rounded-xl border border-slate-200 p-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mensagem interna ao owner</p>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={messageReason}
                onChange={(event) => setMessageReason(event.target.value)}
              >
                <option value="Solicitar aprovação de vaga">Solicitar aprovação de vaga</option>
                <option value="Atualizar perfil">Atualizar perfil</option>
                <option value="Assunto administrativo">Assunto administrativo</option>
                <option value="Outro">Outro</option>
              </select>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                maxLength={600}
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="Escreva a sua mensagem..."
              />
              <button
                type="button"
                onClick={() => sendInternalMessage().catch(() => null)}
                disabled={sendingMessage || !message.trim()}
                className="mt-2 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {sendingMessage ? "A enviar..." : "Enviar mensagem"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
