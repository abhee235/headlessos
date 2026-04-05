// M6.10: Selection & Multi-Select hook
// @see docs/phases/phase-6.md

import { useState, useCallback, useRef } from 'react';

export interface UseSelectionOptions<T> {
  /** Get unique key for each item */
  getKey: (item: T) => string;
  /** All items in the current view */
  items: T[];
}

export interface UseSelectionReturn<T> {
  /** Set of selected item keys */
  selectedKeys: Set<string>;
  /** Whether an item is selected */
  isSelected: (key: string) => boolean;
  /** Handle click on an item — supports Ctrl+Click (toggle) and Shift+Click (range) */
  handleSelect: (key: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  /** Select all items */
  selectAll: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Get selected items as array */
  getSelectedItems: () => T[];
  /** Number of selected items */
  count: number;
}

export function useSelection<T>({ getKey, items }: UseSelectionOptions<T>): UseSelectionReturn<T> {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const lastSelectedRef = useRef<string | null>(null);

  const isSelected = useCallback(
    (key: string) => selectedKeys.has(key),
    [selectedKeys],
  );

  const handleSelect = useCallback(
    (key: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      if (isShift && lastSelectedRef.current) {
        // Range select: from lastSelected to clicked item
        const keys = items.map(getKey);
        const startIdx = keys.indexOf(lastSelectedRef.current);
        const endIdx = keys.indexOf(key);
        if (startIdx !== -1 && endIdx !== -1) {
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx);
          const rangeKeys = keys.slice(lo, hi + 1);
          setSelectedKeys(prev => {
            const next = new Set(isCtrl ? prev : []);
            for (const k of rangeKeys) next.add(k);
            return next;
          });
        }
      } else if (isCtrl) {
        // Toggle single item
        setSelectedKeys(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        lastSelectedRef.current = key;
      } else {
        // Simple click — select just this item
        setSelectedKeys(new Set([key]));
        lastSelectedRef.current = key;
      }
    },
    [items, getKey],
  );

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(items.map(getKey)));
  }, [items, getKey]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    lastSelectedRef.current = null;
  }, []);

  const getSelectedItems = useCallback(
    () => items.filter(item => selectedKeys.has(getKey(item))),
    [items, getKey, selectedKeys],
  );

  return {
    selectedKeys,
    isSelected,
    handleSelect,
    selectAll,
    clearSelection,
    getSelectedItems,
    count: selectedKeys.size,
  };
}
