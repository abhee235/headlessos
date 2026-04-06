// M10.1: Notification Store Unit Tests
// @see docs/PROGRESS.md

import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from '../../src/store/notification-store';

describe('NotificationStore', () => {
  beforeEach(() => {
    // Reset store between tests
    const { clearAll, closePanel } = useNotificationStore.getState();
    clearAll();
    closePanel();
  });

  it('should start with empty notifications', () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.panelOpen).toBe(false);
  });

  it('should add a notification', () => {
    useNotificationStore.getState().addNotification({
      type: 'info',
      title: 'Test',
      message: 'Hello',
    });
    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]!.title).toBe('Test');
    expect(state.notifications[0]!.read).toBe(false);
    expect(state.notifications[0]!.type).toBe('info');
  });

  it('should add notifications at the top (newest first)', () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({ type: 'info', title: 'First' });
    addNotification({ type: 'success', title: 'Second' });
    const state = useNotificationStore.getState();
    expect(state.notifications[0]!.title).toBe('Second');
    expect(state.notifications[1]!.title).toBe('First');
  });

  it('should mark a notification as read', () => {
    useNotificationStore.getState().addNotification({ type: 'info', title: 'Test' });
    const id = useNotificationStore.getState().notifications[0]!.id;
    useNotificationStore.getState().markRead(id);
    expect(useNotificationStore.getState().notifications[0]!.read).toBe(true);
  });

  it('should mark all as read', () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({ type: 'info', title: 'A' });
    addNotification({ type: 'error', title: 'B' });
    useNotificationStore.getState().markAllRead();
    const all = useNotificationStore.getState().notifications;
    expect(all.every(n => n.read)).toBe(true);
  });

  it('should dismiss a notification', () => {
    useNotificationStore.getState().addNotification({ type: 'info', title: 'Remove me' });
    const id = useNotificationStore.getState().notifications[0]!.id;
    useNotificationStore.getState().dismiss(id);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('should clear all notifications', () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({ type: 'info', title: 'A' });
    addNotification({ type: 'info', title: 'B' });
    addNotification({ type: 'info', title: 'C' });
    useNotificationStore.getState().clearAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('should toggle panel', () => {
    expect(useNotificationStore.getState().panelOpen).toBe(false);
    useNotificationStore.getState().togglePanel();
    expect(useNotificationStore.getState().panelOpen).toBe(true);
    useNotificationStore.getState().togglePanel();
    expect(useNotificationStore.getState().panelOpen).toBe(false);
  });

  it('should limit to 100 notifications', () => {
    const { addNotification } = useNotificationStore.getState();
    for (let i = 0; i < 110; i++) {
      addNotification({ type: 'info', title: `N${i}` });
    }
    expect(useNotificationStore.getState().notifications.length).toBeLessThanOrEqual(100);
  });

  it('should support optional source field', () => {
    useNotificationStore.getState().addNotification({
      type: 'warning',
      title: 'Docker Alert',
      source: 'docker',
    });
    expect(useNotificationStore.getState().notifications[0]!.source).toBe('docker');
  });
});
