import { useEffect, useState } from 'react';
import { clearLocalStoragePrefix, safeLocalStorageRemoveItem, safeLocalStorageSetItem } from './storageUtils';

const OFFLINE_MODE_KEY = 'sorteios_offline_mode_enabled';
const OFFLINE_QUEUE_KEY = 'sorteios_offline_queue_v1';
const OFFLINE_SYNCING_KEY = 'sorteios_offline_syncing_v1';
const OFFLINE_APP_STATE_KEY = 'sorteios_offline_app_state_v1';
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

export interface OfflineAppState {
  bingo?: Record<string, unknown>;
  auth?: Record<string, unknown>;
}

const readBoolean = (key: string): boolean => localStorage.getItem(key) === 'true';

export const isOfflineModeEnabled = (): boolean => readBoolean(OFFLINE_MODE_KEY);

export const setOfflineModeEnabled = (enabled: boolean): void => {
  safeLocalStorageSetItem(OFFLINE_MODE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_MODE, { detail: { enabled } }));
};

export const clearOfflineSessionState = (): void => {
  safeLocalStorageRemoveItem(OFFLINE_QUEUE_KEY);
  safeLocalStorageRemoveItem(OFFLINE_SYNCING_KEY);
  safeLocalStorageRemoveItem(OFFLINE_APP_STATE_KEY);
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_QUEUE, { detail: { size: 0 } }));
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_SYNC_STATE, { detail: { syncing: false } }));
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
  const payload = JSON.stringify(queue.slice(-200));
  if (!safeLocalStorageSetItem(OFFLINE_QUEUE_KEY, payload)) {
    clearLocalStoragePrefix('sorteios_offline_cache_v1:');
    safeLocalStorageSetItem(OFFLINE_QUEUE_KEY, payload);
  }
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_QUEUE, { detail: { size: queue.length } }));
};

export const isOfflineSyncing = (): boolean => readBoolean(OFFLINE_SYNCING_KEY);

export const setOfflineSyncing = (syncing: boolean): void => {
  safeLocalStorageSetItem(OFFLINE_SYNCING_KEY, syncing ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_SYNC_STATE, { detail: { syncing } }));
};

export const getOfflineAppState = (): OfflineAppState => {
  try {
    const raw = localStorage.getItem(OFFLINE_APP_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const setOfflineAppState = (state: OfflineAppState): void => {
  const payload = JSON.stringify(state);
  if (safeLocalStorageSetItem(OFFLINE_APP_STATE_KEY, payload)) return;

  const next = { ...state } as OfflineAppState;
  const auth = (next.auth || {}) as Record<string, unknown>;
  const bingo = (next.bingo || {}) as Record<string, unknown>;
  const drawTab = (bingo.drawTab || {}) as Record<string, unknown>;

  delete auth.users;
  delete auth.planos;
  delete auth.lojaCompradores;
  delete auth.cartelasCompradorByEmail;
  delete bingo.cartelasComGrade;
  delete drawTab.cardsWithGrade;

  const pruned: OfflineAppState = {
    ...next,
    auth,
    bingo: {
      ...bingo,
      drawTab,
    },
  };

  if (!safeLocalStorageSetItem(OFFLINE_APP_STATE_KEY, JSON.stringify(pruned))) {
    clearLocalStoragePrefix('sorteios_offline_cache_v1:');
    safeLocalStorageSetItem(OFFLINE_APP_STATE_KEY, JSON.stringify(pruned));
  }
};

export const patchOfflineAppState = (patch: Partial<OfflineAppState>): OfflineAppState => {
  const current = getOfflineAppState();
  const next = { ...current, ...patch };
  setOfflineAppState(next);
  return next;
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

  const toggle = () => {
    const next = !enabled;
    setOfflineModeEnabled(next);
    if (!next) {
      clearOfflineSessionState();
      window.location.reload();
    }
  };

  return { enabled, online, queueSize, syncing, toggle };
};

export const OFFLINE_EVENT_NAMES = {
  modeChanged: OFFLINE_EVENT_MODE,
  queueChanged: OFFLINE_EVENT_QUEUE,
  syncComplete: OFFLINE_EVENT_SYNC,
  syncStateChanged: OFFLINE_EVENT_SYNC_STATE,
} as const;
