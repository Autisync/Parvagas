import { useMemo, useState } from "react";

export function useBulkSelection(idsOnPage: string[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const pageIds = useMemo(
    () => Array.from(new Set(idsOnPage.filter(Boolean))),
    [idsOnPage]
  );

  const allVisibleSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const toggleVisible = () => {
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !pageIds.includes(id))
        : Array.from(new Set([...current, ...pageIds]))
    );
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const replaceSelection = (ids: string[]) => {
    setSelectedIds(Array.from(new Set(ids.filter(Boolean))));
  };

  return {
    selectedIds,
    pageIds,
    allVisibleSelected,
    toggleSelect,
    toggleVisible,
    clearSelection,
    replaceSelection,
  };
}
