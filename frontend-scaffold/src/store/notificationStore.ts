import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType = 'tip' | 'achievement' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  unread: boolean;
  link?: string;
}

interface NotificationState {
  notifications: AppNotification[];
}

interface NotificationActions {
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp'>) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

type NotificationStore = NotificationState & NotificationActions;

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      notifications: [],

      addNotification: (n) => {
        const id = crypto.randomUUID();
        const notification: AppNotification = {
          ...n,
          id,
          timestamp: Date.now(),
        };
        set((state) => ({
          notifications: [notification, ...state.notifications],
        }));
        return id;
      },

      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, unread: false } : n,
          ),
        })),

      markAllAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, unread: false })),
        })),

      clearAll: () => set({ notifications: [] }),
    }),
    {
      name: 'tipz_notifications',
      partialize: (state) => ({ notifications: state.notifications }),
    },
  ),
);

export const addNotification = (n: Omit<AppNotification, 'id' | 'timestamp'>): string =>
  useNotificationStore.getState().addNotification(n);

export const getNotifications = (): AppNotification[] =>
  useNotificationStore.getState().notifications;
