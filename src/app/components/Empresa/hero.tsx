"use client";
import { useState } from "react";

export default function EmpresaHero() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="bg-white">
      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-4xl py-32 sm:py-48 lg:py-56">
          <div className="text-center">
            <h1 className="text-xl font-normal tracking-tight text-gray-800 sm:text-xl">
              Ajudando Empresas
            </h1>
            <h1 className="text-5xl font-bold tracking-tight text-red-500 sm:text-7xl">
              Maior <span className="text-gray-900">Base de Dados de </span>
              <span className="text-red-500"> Talentos em Angola</span>
            </h1>
            <p className="mt-6 text-lg leading-6 text-gray-700 font-light">
              Uma plataforma útil para quem procura talento Profissional para
              seus Projetos em Angola. Oferecemos acesso a uma ampla gama de
              Profissionais em diferentes setores e locais.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <a
                href="#"
                className="text-sm font-semibold leading-6 text-gray-900 hover:text-red-500 hover:scale-105 duration-500 ease-in-out transform"
              >
                Encontrar Talento Profissional <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
