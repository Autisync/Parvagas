type FilterOption = {
  key: string;
  label: string;
  count?: number;
};

type PresetOption = {
  key: string;
  label: string;
  description?: string;
};

type InsightsToolbarProps = {
  query: string;
  onQueryChange: (next: string) => void;
  placeholder: string;
  selectedFilter: string;
  onFilterChange: (next: string) => void;
  filters: FilterOption[];
  resultLabel: string;
  presets?: PresetOption[];
  activePreset?: string;
  onPresetSelect?: (presetKey: string) => void;
};

export default function InsightsToolbar({
  query,
  onQueryChange,
  placeholder,
  selectedFilter,
  onFilterChange,
  filters,
  resultLabel,
  presets = [],
  activePreset,
  onPresetSelect,
}: InsightsToolbarProps) {
  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
      {presets.length > 0 && onPresetSelect && (
        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((preset) => {
            const active = activePreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => onPresetSelect(preset.key)}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                  active
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <p className="font-semibold">{preset.label}</p>
                {preset.description && <p className="mt-0.5 text-[11px] opacity-80">{preset.description}</p>}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr,auto] lg:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-full app-input"
        />
        <p className="text-sm text-slate-500 lg:text-right">{resultLabel}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = selectedFilter === filter.key;
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onFilterChange(filter.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-red-600 bg-red-50 text-red-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {filter.label}
              {typeof filter.count === "number" ? ` (${filter.count})` : ""}
            </button>
          );
        })}
      </div>
    </section>
  );
}
