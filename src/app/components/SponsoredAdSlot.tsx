"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type AdPayload = {
  _id: string;
  title?: string;
  placement?: string;
  link?: string;
  imageUrl?: string;
};

type AdResponse = {
  ad: AdPayload | null;
};

type SponsoredAdSlotProps = {
  placement: string;
  className?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
};

export default function SponsoredAdSlot({
  placement,
  className = "",
  fallbackTitle = "Publicidade",
  fallbackDescription = "Espaco reservado para campanhas patrocinadas.",
}: SponsoredAdSlotProps) {
  const [ad, setAd] = useState<AdPayload | null>(null);

  useEffect(() => {
    let mounted = true;

    apiFetch<AdResponse>(`/ads/placements/${encodeURIComponent(placement)}`, {
      suppressGlobalErrors: true,
    })
      .then((res) => {
        if (!mounted) return;
        setAd(res?.ad ?? null);
      })
      .catch(() => {
        if (!mounted) return;
        setAd(null);
      });

    return () => {
      mounted = false;
    };
  }, [placement]);

  const hasCreative = useMemo(() => Boolean(ad?.imageUrl || ad?.title), [ad?.imageUrl, ad?.title]);

  const handleClick = async () => {
    if (!ad?._id) return;
    try {
      await apiFetch(`/ads/${encodeURIComponent(ad._id)}/click`, {
        method: "POST",
        suppressGlobalErrors: true,
      });
    } catch {
      // Ignore tracking errors to avoid disrupting navigation.
    }
  };

  if (!ad || !hasCreative) {
    return (
      <article className={`rounded-3xl border border-red-200 bg-red-600 p-8 text-white ${className}`}>
        <h2 className="text-2xl font-bold">{fallbackTitle}</h2>
        <p className="mt-2">{fallbackDescription}</p>
      </article>
    );
  }

  return (
    <a
      href={ad.link || "#"}
      target={ad.link ? "_blank" : undefined}
      rel={ad.link ? "noreferrer noopener" : undefined}
      onClick={handleClick}
      className={`block overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-lg ${className}`}
      aria-label={ad.title || "Publicidade"}
    >
      {ad.imageUrl ? (
        <img src={ad.imageUrl} alt={ad.title || "Publicidade"} className="h-52 w-full object-cover" loading="lazy" />
      ) : null}
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Patrocinado</p>
        <h3 className="mt-2 text-lg font-bold text-slate-900">{ad.title || "Publicidade"}</h3>
        {ad.link ? <p className="mt-2 text-sm font-semibold text-red-700">Ver oferta patrocinada</p> : null}
      </div>
    </a>
  );
}
