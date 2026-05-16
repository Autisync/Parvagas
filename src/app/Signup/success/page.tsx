"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignupSuccessContent() {
  const searchParams = useSearchParams();
  const role = searchParams.get("role") === "company" ? "company" : "candidate";
  const email = String(searchParams.get("email") || "").trim();

  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Check your email to verify your account.</h1>
        <p className="mt-2 text-sm text-slate-700">
          We sent a verification link to {email || "your email address"}. Confirm your email before signing in.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/Login?role=${role}`} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
            Go to sign in
          </Link>
          <Link href="/resend-verification" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Resend verification email
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function SignupSuccessPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl px-4 py-20"><div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">Loading...</div></main>}>
      <SignupSuccessContent />
    </Suspense>
  );
}
