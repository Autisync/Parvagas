"use client";

import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { CheckCircleIcon as CheckCircleOutlineIcon } from "@heroicons/react/24/outline";
import { Reveal } from "@/app/components/motion";

export type FirstStepItem = {
  key: string;
  label: string;
  href: string;
  done: boolean;
};

/** "Primeiros passos" progress card — the guided follow-up to the welcome
 * tutorial. Each item deep-links to the exact page that completes it, so a
 * first-time candidate has concrete next actions instead of a slideshow
 * they've already dismissed. Disappears once every item is done. */
export default function FirstStepsChecklist({ items }: { items: FirstStepItem[] }) {
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  return (
    <Reveal>
      <div className="rounded-2xl border border-red-100 bg-red-50/60 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">
            Primeiros passos <span className="text-red-600">({doneCount}/{items.length})</span>
          </p>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-red-100">
            <div
              className="h-full rounded-full bg-red-600 transition-all duration-500"
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                  item.done
                    ? "text-slate-400"
                    : "text-slate-800 hover:bg-white hover:shadow-sm"
                }`}
              >
                {item.done ? (
                  <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-500" />
                ) : (
                  <CheckCircleOutlineIcon className="h-5 w-5 shrink-0 text-red-400" />
                )}
                <span className={item.done ? "line-through" : "font-medium"}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}
