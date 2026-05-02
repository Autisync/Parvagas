"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function EmpresaPortalPage() {
  const { loading } = useAuth("company");
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace("/Portal/Empresa/Dashboard");
    }
  }, [loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
    </div>
  );
}

