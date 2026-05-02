"use client";

import { useEffect, useState } from "react";
import { apiUrl, getToken } from "@/lib/api";

type Overview = {
  totalUsers?: number;
  totalJobs?: number;
  totalApplications?: number;
  totalCompanies?: number;
  pendingJobs?: number;
  suspendedUsers?: number;
};

export default function AdminOverviewBanner() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(apiUrl("/admin/overview"), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d.overview ?? d); })
      .catch(() => {/* non-critical */});
  }, []);

  if (!data) return null;

  const stats = [
    { label: "Utilizadores", value: data.totalUsers ?? "–" },
    { label: "Empresas", value: data.totalCompanies ?? "–" },
    { label: "Vagas", value: data.totalJobs ?? "–" },
    { label: "Candidaturas", value: data.totalApplications ?? "–" },
    { label: "Pendentes", value: data.pendingJobs ?? "–", warn: (data.pendingJobs ?? 0) > 0 },
    { label: "Suspensos", value: data.suspendedUsers ?? "–", warn: (data.suspendedUsers ?? 0) > 0 },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map(s => (
        <div key={s.label} className={`rounded-xl p-4 text-center ${s.warn ? "bg-red-50 border border-red-200" : "bg-white shadow-sm"}`}>
          <p className={`text-2xl font-bold ${s.warn ? "text-red-600" : "text-gray-900"}`}>{s.value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
