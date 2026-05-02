"use client";

import { useState } from "react";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function JsonNode({ value, depth = 0 }: { value: JsonValue; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (value === null) return <span className="text-rose-400">null</span>;
  if (typeof value === "boolean")
    return <span className="text-purple-400">{value ? "true" : "false"}</span>;
  if (typeof value === "number")
    return <span className="text-amber-400">{value}</span>;
  if (typeof value === "string")
    return <span className="text-emerald-400">&quot;{value}&quot;</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">[]</span>;
    return (
      <span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded px-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus:outline-none"
          aria-label={collapsed ? "Expandir array" : "Colapsar array"}
        >
          {collapsed ? `[…${value.length}]` : "["}
        </button>
        {!collapsed && (
          <>
            <span className="block pl-4">
              {value.map((item, i) => (
                <span key={i} className="block">
                  <JsonNode value={item} depth={depth + 1} />
                  {i < value.length - 1 && <span className="text-slate-500">,</span>}
                </span>
              ))}
            </span>
            <span className="text-slate-400">]</span>
          </>
        )}
      </span>
    );
  }

  // object
  const keys = Object.keys(value);
  if (keys.length === 0) return <span className="text-slate-400">{"{}"}</span>;
  return (
    <span>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="rounded px-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus:outline-none"
        aria-label={collapsed ? "Expandir objeto" : "Colapsar objeto"}
      >
        {collapsed ? `{…${keys.length}}` : "{"}
      </button>
      {!collapsed && (
        <>
          <span className="block pl-4">
            {keys.map((key, i) => (
              <span key={key} className="block">
                <span className="text-sky-400">&quot;{key}&quot;</span>
                <span className="text-slate-400">: </span>
                <JsonNode value={(value as Record<string, JsonValue>)[key]} depth={depth + 1} />
                {i < keys.length - 1 && <span className="text-slate-500">,</span>}
              </span>
            ))}
          </span>
          <span className="text-slate-400">{"}"}</span>
        </>
      )}
    </span>
  );
}

export default function JsonBlock({ data }: { data: unknown }) {
  return (
    <div className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 px-4 py-3 text-[11px] leading-5 font-mono">
      <JsonNode value={data as JsonValue} depth={0} />
    </div>
  );
}
