// Unit tests for useSelection hook — click, ctrl+click, shift+click, select all
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelection } from '../../src/hooks/useSelection';

interface TestItem {
  id: string;
  name: string;
}

const items: TestItem[] = [
  { id: '1', name: 'alpha.txt' },
  { id: '2', name: 'beta.txt' },
  { id: '3', name: 'gamma.txt' },
  { id: '4', name: 'delta.txt' },
  { id: '5', name: 'epsilon.txt' },
];

const noModifiers = { ctrlKey: false, metaKey: false, shiftKey: false };
const ctrlMod = { ctrlKey: true, metaKey: false, shiftKey: false };
const metaMod = { ctrlKey: false, metaKey: true, shiftKey: false };
const shiftMod = { ctrlKey: false, metaKey: false, shiftKey: true };

function setup() {
  return renderHook(() =>
    useSelection<TestItem>({ items, getKey: (item) => item.id }),
  );
}

describe('useSelection', () => {
  describe('initial state', () => {
    it('starts with empty selection', () => {
      const { result } = setup();
      expect(result.current.count).toBe(0);
      expect(result.current.selectedKeys.size).toBe(0);
    });

    it('isSelected returns false for all items', () => {
      const { result } = setup();
      items.forEach(item => {
        expect(result.current.isSelected(item.id)).toBe(false);
      });
    });
  });

  describe('simple click', () => {
    it('selects a single item', () => {
      const { result } = setup();
      act(() => result.current.handleSelect('1', noModifiers));
      expect(result.current.isSelected('1')).toBe(true);
      expect(result.current.count).toBe(1);
    });

    it('replaces selection on second click', () => {
      const { result } = setup();
      act(() => result.current.handleSelect('1', noModifiers));
      act(() => result.current.handleSelect('3', noModifiers));
      expect(result.current.isSelected('1')).toBe(false);
      expect(result.current.isSelected('3')).toBe(true);
      expect(result.current.count).toBe(1);
    });
  });

  describe('ctrl/cmd+click', () => {
    it('toggles items with ctrl', () => {
      const { result } = setup();
      act(() => result.current.handleSelect('1', ctrlMod));
      act(() => result.current.handleSelect('3', ctrlMod));
      expect(result.current.isSelected('1')).toBe(true);
      expect(result.current.isSelected('3')).toBe(true);
      expect(result.current.count).toBe(2);
    });

    it('toggles items with meta (cmd)', () => {
      const { result } = setup();
      act(() => result.current.handleSelect('2', metaMod));
      act(() => result.current.handleSelect('4', metaMod));
      expect(result.current.isSelected('2')).toBe(true);
      expect(result.current.isSelected('4')).toBe(true);
      expect(result.current.count).toBe(2);
    });

    it('deselects on second ctrl+click', () => {
      const { result } = setup();
      act(() => result.current.handleSelect('1', ctrlMod));
      act(() => result.current.handleSelect('1', ctrlMod));
      expect(result.current.isSelected('1')).toBe(false);
      expect(result.current.count).toBe(0);
    });
  });

  describe('shift+click (range)', () => {
    it('selects a range of items', () => {
      const { result } = setup();
      act(() => result.current.handleSelect('2', noModifiers)); // anchor
      act(() => result.current.handleSelect('4', shiftMod));    // range
      expect(result.current.isSelected('1')).toBe(false);
      expect(result.current.isSelected('2')).toBe(true);
      expect(result.current.isSelected('3')).toBe(true);
      expect(result.current.isSelected('4')).toBe(true);
      expect(result.current.isSelected('5')).toBe(false);
      expect(result.current.count).toBe(3);
    });

    it('handles reverse range', () => {
      const { result } = setup();
      act(() => result.current.handleSelect('4', noModifiers));
      act(() => result.current.handleSelect('2', shiftMod));
      expect(result.current.isSelected('2')).toBe(true);
      expect(result.current.isSelected('3')).toBe(true);
      expect(result.current.isSelected('4')).toBe(true);
      expect(result.current.count).toBe(3);
    });
  });

  describe('selectAll', () => {
    it('selects all items', () => {
      const { result } = setup();
      act(() => result.current.selectAll());
      expect(result.current.count).toBe(5);
      items.forEach(item => {
        expect(result.current.isSelected(item.id)).toBe(true);
      });
    });
  });

  describe('clearSelection', () => {
    it('clears all selections', () => {
      const { result } = setup();
      act(() => result.current.selectAll());
      act(() => result.current.clearSelection());
      expect(result.current.count).toBe(0);
    });
  });

  describe('getSelectedItems', () => {
    it('returns selected items in order', () => {
      const { result } = setup();
      act(() => result.current.handleSelect('1', noModifiers));
      act(() => result.current.handleSelect('3', ctrlMod));
      const selected = result.current.getSelectedItems();
      expect(selected).toHaveLength(2);
      expect(selected[0].name).toBe('alpha.txt');
      expect(selected[1].name).toBe('gamma.txt');
    });

    it('returns empty array when nothing selected', () => {
      const { result } = setup();
      expect(result.current.getSelectedItems()).toHaveLength(0);
    });
  });
});
