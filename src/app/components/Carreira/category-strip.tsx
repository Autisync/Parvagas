"use client";

import Image from "next/image";
import { useClientLocale } from "@/lib/i18n/client";

const CATEGORIES = [
  {
    key: "catCv",
    photo:
      "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&q=80",
    alt: "Pessoa a escrever CV",
  },
  {
    key: "catInterview",
    photo:
      "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&q=80",
    alt: "Entrevista de emprego",
  },
  {
    key: "catCareer",
    photo:
      "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600&q=80",
    alt: "Crescimento de carreira",
  },
  {
    key: "catRemote",
    photo:
      "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80",
    alt: "Trabalho remoto",
  },
] as const;

type CatKey = (typeof CATEGORIES)[number]["key"];

interface Props {
  active: string;
  onSelect: (cat: string) => void;
}

export default function CarreiraCategoryStrip({ active, onSelect }: Props) {
  const { dict } = useClientLocale();
  const cl = dict.careerList;

  const label: Record<CatKey | "catAll", string> = {
    catAll: cl.catAll,
    catCv: cl.catCv,
    catInterview: cl.catInterview,
    catCareer: cl.catCareer,
    catRemote: cl.catRemote,
  };

  return (
    <div className="mx-auto max-w-7xl px-6 lg:px-8">
      {/* Photo cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onSelect(cat.key === active ? "catAll" : cat.key)}
            className={`group relative overflow-hidden rounded-2xl aspect-[3/2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 ${
              active === cat.key ? "ring-2 ring-red-600" : ""
            }`}
            aria-pressed={active === cat.key}
          >
            <Image
              src={cat.photo}
              alt={cat.alt}
              fill
              className="object-cover transition duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, 25vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/70 via-gray-900/20 to-transparent" />
            <span className="absolute bottom-3 left-3 right-3 text-left text-sm font-semibold text-white drop-shadow">
              {label[cat.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Text pill filters (also accessible alternative) */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["catAll", "catCv", "catInterview", "catCareer", "catRemote"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              active === key
                ? "bg-red-600 text-white"
                : "border border-red-100 text-gray-700 hover:bg-red-50 hover:text-red-700"
            }`}
          >
            {label[key]}
          </button>
        ))}
      </div>
    </div>
  );
}
