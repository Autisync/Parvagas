import Image from "next/image";

/**
 * Global route-level loading screen. Next shows this as the Suspense fallback
 * while a route segment streams in. Branded, minimal, and reduced-motion aware
 * (the spin animation is neutralised by the global prefers-reduced-motion rule).
 */
export default function Loading() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-white">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full border-4 border-red-100 border-t-red-600"
          style={{ animation: "pv-spin 0.9s linear infinite" }}
          aria-hidden
        />
        <Image src="/icon2.png" alt="Parvagas" width={40} height={40} className="h-9 w-9 object-contain" priority />
      </div>
      <div className="pv-animate-fade text-center">
        <p className="text-sm font-semibold tracking-wide text-slate-700">Parvagas</p>
        <p className="mt-1 text-xs text-slate-400">A carregar…</p>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        A carregar conteúdo
      </span>
    </div>
  );
}
