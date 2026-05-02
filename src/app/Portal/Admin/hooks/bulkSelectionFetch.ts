type PageFetchResult<T> = {
  items: T[];
  totalPages: number;
};

export async function collectAllIdsAcrossPages<T>(options: {
  fetchPage: (page: number) => Promise<PageFetchResult<T>>;
  getId: (item: T) => string;
}) {
  const ids: string[] = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const { items, totalPages: nextTotalPages } = await options.fetchPage(currentPage);
    ids.push(...items.map(options.getId));
    totalPages = nextTotalPages || 1;
    currentPage += 1;
  }

  return Array.from(new Set(ids.filter(Boolean)));
}

export async function collectSelectedItemsAcrossPages<T>(options: {
  fetchPage: (page: number) => Promise<PageFetchResult<T>>;
  selectedIds: string[];
  getId: (item: T) => string;
}) {
  const selectedSet = new Set(options.selectedIds);
  const entries: T[] = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const { items, totalPages: nextTotalPages } = await options.fetchPage(currentPage);
    entries.push(...items.filter((item) => selectedSet.has(options.getId(item))));
    totalPages = nextTotalPages || 1;
    currentPage += 1;
  }

  return entries;
}
