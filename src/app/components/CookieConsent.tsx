"use client";

import { useEffect, useState } from "react";

const KEY = "parvagas_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    setVisible(!stored);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[60] rounded-2xl border border-red-200 bg-white p-4 shadow-lg md:left-auto md:max-w-xl">
      <p className="text-sm text-gray-700">
        Usamos cookies essenciais para funcionamento da plataforma e métricas básicas de desempenho.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          onClick={() => {
            localStorage.setItem(KEY, "accepted");
            setVisible(false);
          }}
          className="rounded-full bg-red-600 text-white px-4 py-2 text-sm font-semibold"
        >
          Aceitar
        </button>
        <button
          onClick={() => {
            localStorage.setItem(KEY, "declined");
            setVisible(false);
          }}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold"
        >
          Recusar opcionais
        </button>
      </div>
    </div>
  );
}
