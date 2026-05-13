import { useEffect, useState } from 'react';

const OFFLINE_MODE_KEY = 'sorteios_offline_mode_enabled';
const OFFLINE_QUEUE_KEY = 'sorteios_offline_queue_v1';
const OFFLINE_SYNCING_KEY = 'sorteios_offline_syncing_v1';
const OFFLINE_EVENT_MODE = 'sorteios-offline-mode-changed';
const OFFLINE_EVENT_QUEUE = 'sorteios-offline-queue-changed';
const OFFLINE_EVENT_SYNC = 'sorteios-offline-sync-complete';
const OFFLINE_EVENT_SYNC_STATE = 'sorteios-offline-sync-state-changed';

export interface OfflineQueueItem {
  id: string;
  action: string;
  data: Record<string, unknown>;
  createdAt: number;
  attempts: number;
}

const readBoolean = (key: string): boolean => localStorage.getItem(key) === 'true';

export const isOfflineModeEnabled = (): boolean => readBoolean(OFFLINE_MODE_KEY);

export const setOfflineModeEnabled = (enabled: boolean): void => {
  localStorage.setItem(OFFLINE_MODE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_MODE, { detail: { enabled } }));
};

export const toggleOfflineMode = (): boolean => {
  const next = !isOfflineModeEnabled();
  setOfflineModeEnabled(next);
  return next;
};

export const getOfflineQueue = (): OfflineQueueItem[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const setOfflineQueue = (queue: OfflineQueueItem[]): void => {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.slice(-500)));
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_QUEUE, { detail: { size: queue.length } }));
};

export const isOfflineSyncing = (): boolean => readBoolean(OFFLINE_SYNCING_KEY);

export const setOfflineSyncing = (syncing: boolean): void => {
  localStorage.setItem(OFFLINE_SYNCING_KEY, syncing ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_SYNC_STATE, { detail: { syncing } }));
};

export const enqueueOfflineRequest = (item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'attempts'>): OfflineQueueItem => {
  const queuedItem: OfflineQueueItem = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: Date.now(),
    attempts: 0,
    ...item,
  };
  const queue = getOfflineQueue();
  queue.push(queuedItem);
  setOfflineQueue(queue);
  return queuedItem;
};

export const useOfflineMode = () => {
  const [enabled, setEnabled] = useState(isOfflineModeEnabled());
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queueSize, setQueueSize] = useState(getOfflineQueue().length);
  const [syncing, setSyncing] = useState(isOfflineSyncing());

  useEffect(() => {
    const handleMode = () => setEnabled(isOfflineModeEnabled());
    const handleQueue = () => setQueueSize(getOfflineQueue().length);
    const handleSyncState = () => setSyncing(isOfflineSyncing());
    const handleOnline = () => setOnline(navigator.onLine);

    window.addEventListener(OFFLINE_EVENT_MODE, handleMode);
    window.addEventListener(OFFLINE_EVENT_QUEUE, handleQueue);
    window.addEventListener(OFFLINE_EVENT_SYNC, handleQueue);
    window.addEventListener(OFFLINE_EVENT_SYNC_STATE, handleSyncState);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOnline);

    return () => {
      window.removeEventListener(OFFLINE_EVENT_MODE, handleMode);
      window.removeEventListener(OFFLINE_EVENT_QUEUE, handleQueue);
      window.removeEventListener(OFFLINE_EVENT_SYNC, handleQueue);
      window.removeEventListener(OFFLINE_EVENT_SYNC_STATE, handleSyncState);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOnline);
    };
  }, []);

  return { enabled, online, queueSize, syncing, toggle: () => setOfflineModeEnabled(!enabled) };
};

export const OFFLINE_EVENT_NAMES = {
  modeChanged: OFFLINE_EVENT_MODE,
  queueChanged: OFFLINE_EVENT_QUEUE,
  syncComplete: OFFLINE_EVENT_SYNC,
  syncStateChanged: OFFLINE_EVENT_SYNC_STATE,
} as const;
