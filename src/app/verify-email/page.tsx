"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetchRaw } from "@/lib/api";

type VerifyResponse = {
  success?: boolean;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setSuccess(false);
      setMessage("Verification token is missing.");
      return;
    }

    setLoading(true);
    void apiFetchRaw(`/auth/verify-email`, {
      method: "POST",
      suppressGlobalErrors: true,
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as VerifyResponse;
        if (!res.ok) {
          const msg = body?.error?.message || body?.message || "We could not verify your email. Please request a new link.";
          throw new Error(msg);
        }
        setSuccess(true);
        setMessage(body?.message || "Email verified successfully.");
      })
      .catch((err: unknown) => {
        setSuccess(false);
        setMessage(err instanceof Error ? err.message : "We could not verify your email. Please request a new link.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Email verification</h1>
        <p className="mt-3 text-sm text-slate-700">{loading ? "Checking verification link..." : message}</p>

        {!loading && success ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Your account is now verified.
          </div>
        ) : null}

        {!loading && !success ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This link may be invalid or expired.
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {!loading && !success ? (
            <Link href="/resend-verification" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
              Resend verification email
            </Link>
          ) : null}
          <Link href="/Login?role=candidate" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Go to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl px-4 py-20"><div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">Loading...</div></main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
