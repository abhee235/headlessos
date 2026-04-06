// Unit tests for clipboard store — copy, cut, paste state management
import { describe, it, expect, beforeEach } from 'vitest';
import { useClipboardStore, type ClipboardEntry } from '../../src/store/clipboard-store';

describe('clipboard-store', () => {
  beforeEach(() => {
    useClipboardStore.setState({
      entries: [],
      operation: null,
      sourceDir: null,
    });
  });

  const sampleEntries: ClipboardEntry[] = [
    { serverId: 'srv1', path: '/home/test/file.txt', name: 'file.txt', isDirectory: false },
    { serverId: 'srv1', path: '/home/test/docs', name: 'docs', isDirectory: true },
  ];

  describe('copy', () => {
    it('stores entries with copy operation', () => {
      useClipboardStore.getState().copy(sampleEntries, '/home/test');
      const state = useClipboardStore.getState();
      expect(state.entries).toEqual(sampleEntries);
      expect(state.operation).toBe('copy');
      expect(state.sourceDir).toBe('/home/test');
    });

    it('replaces previous clipboard content', () => {
      useClipboardStore.getState().copy([sampleEntries[0]], '/home/test');
      useClipboardStore.getState().copy([sampleEntries[1]], '/home/other');
      const state = useClipboardStore.getState();
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].name).toBe('docs');
      expect(state.sourceDir).toBe('/home/other');
    });
  });

  describe('cut', () => {
    it('stores entries with cut operation', () => {
      useClipboardStore.getState().cut(sampleEntries, '/home/test');
      const state = useClipboardStore.getState();
      expect(state.entries).toEqual(sampleEntries);
      expect(state.operation).toBe('cut');
      expect(state.sourceDir).toBe('/home/test');
    });
  });

  describe('clear', () => {
    it('clears all clipboard data', () => {
      useClipboardStore.getState().copy(sampleEntries, '/home/test');
      useClipboardStore.getState().clear();
      const state = useClipboardStore.getState();
      expect(state.entries).toHaveLength(0);
      expect(state.operation).toBeNull();
      expect(state.sourceDir).toBeNull();
    });
  });

  describe('hasEntries', () => {
    it('returns false when clipboard is empty', () => {
      expect(useClipboardStore.getState().hasEntries()).toBe(false);
    });

    it('returns true after copy', () => {
      useClipboardStore.getState().copy(sampleEntries, '/home/test');
      expect(useClipboardStore.getState().hasEntries()).toBe(true);
    });

    it('returns false after clear', () => {
      useClipboardStore.getState().copy(sampleEntries, '/home/test');
      useClipboardStore.getState().clear();
      expect(useClipboardStore.getState().hasEntries()).toBe(false);
    });
  });

  describe('switching operations', () => {
    it('copy replaces cut', () => {
      useClipboardStore.getState().cut(sampleEntries, '/home/test');
      useClipboardStore.getState().copy([sampleEntries[0]], '/home/test');
      const state = useClipboardStore.getState();
      expect(state.operation).toBe('copy');
      expect(state.entries).toHaveLength(1);
    });

    it('cut replaces copy', () => {
      useClipboardStore.getState().copy(sampleEntries, '/home/test');
      useClipboardStore.getState().cut([sampleEntries[1]], '/home/test');
      const state = useClipboardStore.getState();
      expect(state.operation).toBe('cut');
      expect(state.entries).toHaveLength(1);
    });
  });
});
