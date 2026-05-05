"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";

type TagInputProps = {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  error?: string;
  suggestions?: string[];
  maxLength?: number;
};

function normalizeValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export default function TagInput({
  label,
  placeholder,
  values,
  onChange,
  error,
  suggestions = [],
  maxLength = 40,
}: TagInputProps) {
  const [input, setInput] = useState("");

  const lowerValues = useMemo(() => values.map((item) => item.toLowerCase()), [values]);

  const filteredSuggestions = useMemo(() => {
    const search = input.trim().toLowerCase();
    if (!search) return [];
    return suggestions
      .filter((item) => item.toLowerCase().includes(search) && !lowerValues.includes(item.toLowerCase()))
      .slice(0, 5);
  }, [input, suggestions, lowerValues]);

  const addTag = (rawValue: string) => {
    const next = normalizeValue(rawValue);
    if (!next) return;
    if (next.length > maxLength) return;
    if (lowerValues.includes(next.toLowerCase())) return;
    onChange([...values, next]);
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((item) => item !== tag));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(input);
      return;
    }

    if (event.key === "Backspace" && !input && values.length > 0) {
      removeTag(values[values.length - 1]);
    }
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>

      <div className="mb-2 flex flex-wrap gap-2">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full p-0.5 text-red-600 hover:bg-red-100"
              aria-label={`Remover ${tag}`}
            >
              <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>

      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
      />

      {filteredSuggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {filteredSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => addTag(item)}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <p className="mt-1 text-xs text-slate-500">Prima Enter para adicionar.</p>
      {error ? <p className="mt-1 text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
