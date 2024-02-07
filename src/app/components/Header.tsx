"use client";
import { useState } from "react";
import { Dialog } from "@headlessui/react";
import Image from "next/image";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import Logo from "/public/icon2.png";

const navigation = [
  { name: "Início", href: "/" },
  // { name: "Sobre", href: "#" },
  { name: "Empresas", href: "/Empresa/" },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white/90 fixed z-50 w-full">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between p-3 lg:px-8"
        aria-label="Global"
      >
        <div className="flex flex-1">
          <div className="hidden lg:flex lg:gap-x-12">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-sm font-semibold leading-6 text-gray-900 hover:bg-slate-900 py-1 px-3 hover:text-gray-50 hover:rounded-2xl duration-700 ease-in-out transform rounded-md"
              >
                {item.name}
              </Link>
            ))}
          </div>
          <div className="flex lg:hidden">
            <button
              type="button"
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className="sr-only">Open main menu</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
        </div>
        <a href="/" className="-m-1.5 p-1.5">
          <span className="sr-only">Your Company</span>
          <Image
            width={400}
            height={400}
            className="h-10 w-auto hover:scale-110 duration-500 ease-in-out transform"
            src={Logo}
            alt=""
          />
        </a>
        <div className="flex flex-1 justify-end">
          {/* <Link
            href="/Empresa/"
            className="text-sm font-semibold leading-6 text-gray-50  bg-slate-950 px-3 py-1.5 rounded-2xl shadow-md hover:shadow-xl hover:scale-105 hover:bg-slate-900 duration-500 ease-in-out transform"
          >
            Empresas
          </Link> */}
          <Link
            href="/Submission/"
            className="ml-2 text-sm font-semibold leading-6 text-gray-50  bg-slate-950 px-3 py-1.5 rounded-2xl shadow-md hover:shadow-xl hover:scale-105 hover:bg-slate-900 duration-500 ease-in-out transform"
          >
            Submeter CV <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </nav>
      <Dialog
        as="div"
        className="lg:hidden"
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
      >
        <div className="fixed inset-0 z-10" />
        <Dialog.Panel className="fixed inset-y-0 left-0 z-10 w-full overflow-y-auto bg-white px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-1">
              <button
                type="button"
                className="-m-2.5 rounded-md p-2.5 text-gray-700"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="sr-only">Close menu</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            {/* <a href="#" className="-m-1.5 p-1.5">
              <span className="sr-only">Your Company</span>
              <img
                className="h-8 w-auto"
                src="https://tailwindui.com/img/logos/mark.svg?color=indigo&shade=600"
                alt=""
              />
            </a> */}
            <div className="flex flex-1 justify-end">
              <a
                href="/Submission/"
                className="text-sm font-semibold leading-6 text-gray-9000"
              >
                Submeter CV <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50"
              >
                {item.name}
              </a>
            ))}
          </div>
        </Dialog.Panel>
      </Dialog>
    </header>
  );
}
