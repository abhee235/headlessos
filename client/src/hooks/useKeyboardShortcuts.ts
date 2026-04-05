// M6.9: Global Keyboard Shortcuts
// @see docs/phases/phase-6.md

import { useEffect } from 'react';
import { useAppStore } from '../store/app-store';
import { useDesktopStore } from '../store/window-store';

/**
 * Global keyboard shortcuts for the desktop environment.
 * File-explorer-specific shortcuts are handled locally in FileListNew.tsx.
 */
export function useKeyboardShortcuts() {
  const openTab = useAppStore(s => s.openTab);
  const tabs = useAppStore(s => s.tabs);
  const activeTabId = useAppStore(s => s.activeTabId);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const activeServerId = useAppStore(s => s.activeServerId);
  const toggleStartMenu = useDesktopStore(s => s.toggleStartMenu);
  const closeWindow = useDesktopStore(s => s.closeWindow);
  const windows = useDesktopStore(s => s.windows);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;

      // Alt+F4 — Close focused window
      if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        const focused = windows.find(w => w.focused && !w.minimized);
        if (focused) closeWindow(focused.id);
        return;
      }

      // Ctrl/Cmd+Space — Toggle start menu
      if (isMeta && e.code === 'Space') {
        e.preventDefault();
        toggleStartMenu();
        return;
      }

      // Ctrl+Tab — Cycle to next window/tab
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length > 1 && activeTabId) {
          const idx = tabs.findIndex(t => t.id === activeTabId);
          const nextIdx = (idx + 1) % tabs.length;
          setActiveTab(tabs[nextIdx].id);
        }
        return;
      }

      // Ctrl+` — Open terminal
      if (isMeta && e.key === '`' && activeServerId) {
        e.preventDefault();
        openTab(
          { id: 'terminal', name: 'Terminal', icon: 'Terminal', description: 'SSH terminal', requiredTools: [], singleInstance: true },
          activeServerId,
        );
        return;
      }

      // Ctrl+Shift+Esc — Open task manager
      if (isMeta && e.shiftKey && e.key === 'Escape' && activeServerId) {
        e.preventDefault();
        openTab(
          { id: 'task-manager', name: 'Task Manager', icon: 'Activity', description: 'Running processes', requiredTools: [], singleInstance: true },
          activeServerId,
        );
        return;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    toggleStartMenu, openTab, tabs, activeTabId, setActiveTab,
    closeWindow, windows, activeServerId,
  ]);
}

/** 
 * Shortcut reference for help/documentation.
 * Global shortcuts are handled by useKeyboardShortcuts.
 * File explorer shortcuts are handled in FileListNew.tsx.
 */
export const SHORTCUT_REFERENCE = {
  global: [
    { keys: 'Alt+F4', description: 'Close focused window' },
    { keys: 'Ctrl+Space', description: 'Toggle start menu' },
    { keys: 'Ctrl+Tab', description: 'Cycle windows' },
    { keys: 'Ctrl+`', description: 'Open terminal' },
    { keys: 'Ctrl+Shift+Esc', description: 'Open Task Manager' },
  ],
  fileExplorer: [
    { keys: 'Ctrl+C', description: 'Copy selected files' },
    { keys: 'Ctrl+X', description: 'Cut selected files' },
    { keys: 'Ctrl+V', description: 'Paste files' },
    { keys: 'Ctrl+A', description: 'Select all' },
    { keys: 'Delete', description: 'Delete selected' },
    { keys: 'F2', description: 'Rename' },
    { keys: 'F5', description: 'Refresh' },
    { keys: 'Enter', description: 'Open selected' },
    { keys: 'Escape', description: 'Clear selection' },
  ],
} as const;
