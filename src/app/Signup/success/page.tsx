"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { SuccessCheck, MilestoneCelebration } from "@/app/components/motion";

function SignupSuccessContent() {
  const searchParams = useSearchParams();
  const role = searchParams.get("role") === "company" ? "company" : "candidate";
  const email = String(searchParams.get("email") || "").trim();
  const [celebrate, setCelebrate] = useState(true);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-20">
      <MilestoneCelebration show={celebrate} onDone={() => setCelebrate(false)} />

      <div className="app-card pv-animate-pop w-full p-8 text-center">
        <div className="flex justify-center">
          <SuccessCheck size={84} tone="brand" />
        </div>

        <h1 className="mt-6 text-balance text-2xl font-bold text-[var(--text-strong)]">
          Conta criada com sucesso!
        </h1>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
          Enviámos um link de verificação para{" "}
          <span className="font-semibold text-[var(--text-strong)]">
            {email || "o seu email"}
          </span>
          . Confirme o seu email para começar a usar a Parvagas.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={`/Login?role=${role}`} className="app-btn-primary px-5 py-2.5 text-sm">
            Ir para o início de sessão
          </Link>
          <Link href="/resend-verification" className="app-btn-secondary px-5 py-2.5 text-sm">
            Reenviar email de verificação
          </Link>
        </div>
      </div>

      <p className="mt-5 text-xs text-[var(--text-subtle)]">
        Não recebeu o email? Verifique a pasta de spam ou reenvie acima.
      </p>
    </main>
  );
}

export default function SignupSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl px-4 py-20">
          <div className="app-card p-8">
            <div className="app-skeleton h-7 w-2/3" />
            <div className="app-skeleton mt-3 h-4 w-full" />
          </div>
        </main>
      }
    >
      <SignupSuccessContent />
    </Suspense>
  );
}
