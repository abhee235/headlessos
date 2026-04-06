// M10.1: Notification Center Store — persistent notification history
// @see docs/PROGRESS.md

import { create } from 'zustand';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
  /** Source app or system area */
  source?: string;
}

interface NotificationState {
  notifications: Notification[];
  panelOpen: boolean;

  // Actions
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  togglePanel: () => void;
  closePanel: () => void;
  openPanel: () => void;
}

let counter = 0;

const MAX_NOTIFICATIONS = 100;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  panelOpen: false,

  addNotification: (n) => {
    counter++;
    const notification: Notification = {
      ...n,
      id: `notif-${counter}-${Date.now()}`,
      timestamp: Date.now(),
      read: false,
    };
    set(s => ({
      notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
    }));
  },

  markRead: (id) => {
    set(s => ({
      notifications: s.notifications.map(n =>
        n.id === id ? { ...n, read: true } : n,
      ),
    }));
  },

  markAllRead: () => {
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, read: true })),
    }));
  },

  dismiss: (id) => {
    set(s => ({
      notifications: s.notifications.filter(n => n.id !== id),
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },

  togglePanel: () => {
    set(s => ({ panelOpen: !s.panelOpen }));
  },

  closePanel: () => {
    set({ panelOpen: false });
  },

  openPanel: () => {
    set({ panelOpen: true });
  },
}));

/**
 * Helper to push a notification from anywhere.
 * Use alongside toast() for dual display:
 *   toast.success('Done!');
 *   notify({ type: 'success', title: 'Done!' });
 */
export function notify(n: Omit<Notification, 'id' | 'timestamp' | 'read'>) {
  useNotificationStore.getState().addNotification(n);
}
