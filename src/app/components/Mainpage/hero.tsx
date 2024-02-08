"use client";
import Link from "next/link";
import { useState } from "react";

export default function Example() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="bg-white">
      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-4xl py-32 sm:py-48 lg:py-56">
          <div className="text-center">
            <h1 className="font-normal tracking-tight text-gray-800 sm:text-lg">
              Comece Um Amanha Brilhante
            </h1>
            <h1 className="text-5xl font-bold tracking-tight text-red-500 sm:text-7xl">
              Recrutamento{" "}
              <span className="text-gray-900">para Empresas em</span>
              <span className="text-red-500"> Angola</span>
            </h1>
            <p className="mt-6 text-lg leading-6 text-gray-700 font-light">
              Para se candidatar a um emprego através do Angovagas, os
              candidatos podem pesquisar as oportunidades de emprego disponíveis
              e se candidatar às vagas que correspondam às suas habilidades e
              experiência.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/Submission/"
                className="text-sm font-semibold leading-6 text-gray-900 hover:text-red-500 hover:scale-105 duration-500 ease-in-out transform"
              >
                Envia o seu CV Hoje! <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
