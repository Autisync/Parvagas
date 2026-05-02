import { useEffect, useState } from "react";

/**
 * useDebounce: Debounce a value with configurable delay
 * Useful for search inputs, filters, and other user-generated changes
 * that should not trigger API calls on every keystroke
 */
export function useDebounce<T>(value: T, delayMs: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
