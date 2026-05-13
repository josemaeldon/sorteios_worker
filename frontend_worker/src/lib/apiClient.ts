// API Client for selfhosted backend
// Connects directly to the backend API via HTTP
import {
  enqueueOfflineRequest,
  getOfflineAppState,
  getOfflineQueue,
  isOfflineModeEnabled,
  OFFLINE_EVENT_NAMES,
  setOfflineQueue,
  setOfflineSyncing,
} from './offlineMode';

interface ApiConfig {
  baseUrl: string;
  basicAuth?: { username: string; password: string };
}

const isPlaceholder = (value: string): boolean => value.startsWith('__') && value.endsWith('__');

const getEnv = (key: string): string => {
  const v = import.meta.env?.[key as keyof ImportMetaEnv] ?? '';
  return typeof v === 'string' && !isPlaceholder(v) ? v : '';
};

// Get API configuration from environment or default to relative path
const getApiConfig = (): ApiConfig => {
  const apiBaseUrl = getEnv('VITE_API_BASE_URL');
  const basicAuthUser = getEnv('VITE_BASIC_AUTH_USER');
  const basicAuthPass = getEnv('VITE_BASIC_AUTH_PASS');

  // Use configured API base URL or default to empty (relative path)
  return {
    baseUrl: apiBaseUrl || '',
    basicAuth: basicAuthUser ? { username: basicAuthUser, password: basicAuthPass } : undefined,
  };
};

export const apiConfig = getApiConfig();

export const isSelfhostedMode = true;

// Token storage keys
const TOKEN_KEY = 'bingo_auth_token';

export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setStoredToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearStoredToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

// Build authorization header
const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Add Basic Auth if configured
  if (apiConfig.basicAuth) {
    const credentials = btoa(`${apiConfig.basicAuth.username}:${apiConfig.basicAuth.password}`);
    headers['X-Basic-Auth'] = `Basic ${credentials}`;
  }
  
  // Add JWT token if available
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

const OFFLINE_CACHE_PREFIX = 'sorteios_offline_cache_v1:';

const stableStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();
  const normalize = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input as object)) return null;
    seen.add(input as object);
    if (Array.isArray(input)) return input.map(normalize);
    const ordered: Record<string, unknown> = {};
    Object.keys(input as Record<string, unknown>).sort().forEach((key) => {
      ordered[key] = normalize((input as Record<string, unknown>)[key]);
    });
    return ordered;
  };
  return JSON.stringify(normalize(value));
};

const getCacheKey = (action: string, data: Record<string, unknown>): string => `${OFFLINE_CACHE_PREFIX}${action}:${stableStringify(data)}`;
const isLikelyReadAction = (action: string): boolean => /^(get|load|check|list|fetch|export|search|download)/i.test(action);

const getOfflineResponse = (action: string, data: Record<string, unknown> = {}): any | null => {
  const state = getOfflineAppState();
  const bingo = (state.bingo || {}) as Record<string, unknown>;
  const auth = (state.auth || {}) as Record<string, unknown>;
  const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

  switch (action) {
    case 'getMyProfile':
      return { user: auth.user || null };
    case 'getSorteios':
    case 'getAllSorteiosAdmin':
      return { data: asArray(bingo.sorteios) };
    case 'getVendedores':
      return { data: asArray(bingo.vendedores) };
    case 'getCartelas':
      return { data: asArray(bingo.cartelas) };
    case 'getAtribuicoes':
      return { data: asArray(bingo.atribuicoes) };
    case 'getVendas':
      return { data: asArray(bingo.vendas) };
    case 'getCartelaLayouts':
      return { data: asArray(bingo.cartelaLayouts) };
    case 'getCartelasValidadas':
      return { data: asArray(bingo.cartelasValidadas) };
    case 'getMinhaLoja':
      return { data: asArray(bingo.lojaCartelas) };
    case 'getAllUsers':
      return { data: asArray(auth.users) };
    case 'getPublicPlanos':
    case 'getPlanos':
      return { data: asArray(auth.planos || bingo.planos) };
    case 'getConfiguracoes':
    case 'getUserConfiguracoes':
      return { data: auth.configuracoes || {} };
    case 'getUserConfiguracoesByUserId': {
      const userId = String(data.user_id || '');
      const configsByUser = (auth.userConfiguracoesByUserId || {}) as Record<string, Record<string, string>>;
      return { data: configsByUser[userId] || {} };
    }
    case 'getLojaCompradores':
      return { data: asArray(auth.lojaCompradores) };
    case 'getCartelasComprador': {
      const email = String(data.email || '');
      const cartelasByEmail = (auth.cartelasCompradorByEmail || {}) as Record<string, Record<string, unknown>[]>;
      return { data: cartelasByEmail[email] || [] };
    }
    default:
      return null;
  }
};

const readCachedResponse = (action: string, data: Record<string, unknown>): unknown | null => {
  try {
    const raw = localStorage.getItem(getCacheKey(action, data));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCachedResponse = (action: string, data: Record<string, unknown>, response: unknown): void => {
  try {
    localStorage.setItem(getCacheKey(action, data), JSON.stringify(response));
  } catch {
    // Ignore cache write failures.
  }
};

const callApiNetwork = async (action: string, data: Record<string, unknown> = {}): Promise<any> => {
  const endpoints = buildApiEndpoints();
  let lastError: unknown;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        cache: 'no-store',
        body: JSON.stringify({ action, data }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          clearStoredToken();
          throw new Error('Não autorizado. Faça login novamente.');
        }

        const errorData = await response.json().catch(async () => ({ error: (await response.text().catch(() => '')) || 'Erro desconhecido' }));
        const err = new Error((errorData as {error?: string}).error || `HTTP ${response.status}`);
        if ((errorData as { code?: string }).code) (err as Error & { code?: string }).code = (errorData as { code?: string }).code;

        if (response.status >= 500 && endpoint !== '/api') {
          lastError = err;
          continue;
        }

        throw err;
      }

      const payload = await response.json();
      if (isLikelyReadAction(action) || payload) {
        writeCachedResponse(action, data, payload);
      }
      return payload;
    } catch (error) {
      if (endpoint !== '/api') {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha ao conectar com a API.');
};

export const syncOfflineQueue = async (): Promise<void> => {
  if (!isOfflineModeEnabled() || !navigator.onLine) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  setOfflineSyncing(true);
  try {
    const remaining = [...queue];
    const processed: string[] = [];

    for (const item of queue) {
      if (!navigator.onLine) break;
      try {
        const response = await callApiNetwork(item.action, item.data);
        writeCachedResponse(item.action, item.data, response);
        processed.push(item.id);
        remaining.shift();
      } catch (error) {
        console.error('Offline sync item failed:', item.action, error);
        break;
      }
    }

    if (processed.length > 0) {
      setOfflineQueue(remaining);
      window.dispatchEvent(new CustomEvent(OFFLINE_EVENT_NAMES.syncComplete, { detail: { processed: processed.length } }));
    }
  } finally {
    setOfflineSyncing(false);
  }
};

// API call function
export const callApi = async (action: string, data: Record<string, unknown> = {}): Promise<any> => {
  console.log(`API Call: ${action}`, data);

  const offlineEnabled = isOfflineModeEnabled();
  const hasPendingQueue = getOfflineQueue().length > 0;
  if (offlineEnabled) {
    if (isLikelyReadAction(action)) {
      if (!navigator.onLine || hasPendingQueue) {
        const fallback = getOfflineResponse(action, data);
        if (fallback !== null) return fallback;
        const cached = readCachedResponse(action, data);
        if (cached !== null) return cached;
        return { data: [], success: true, offline: true };
      }
    } else {
      enqueueOfflineRequest({ action, data });
      return { success: true, offlineQueued: true };
    }
  }

  try {
    return await callApiNetwork(action, data);
  } catch (error) {
    if (offlineEnabled) {
      if (isLikelyReadAction(action)) {
        const fallback = getOfflineResponse(action, data);
        if (fallback !== null) return fallback;
        const cached = readCachedResponse(action, data);
        if (cached !== null) return cached;
      } else {
        enqueueOfflineRequest({ action, data });
        return { success: true, offlineQueued: true };
      }
    }
    throw error;
  }
};

const buildApiEndpoints = (): string[] => {
  if (!apiConfig.baseUrl) {
    return ['/api'];
  }

  const configuredEndpoint = `${apiConfig.baseUrl.replace(/\/$/, '')}/api`;

  // If API is in another origin, keep a same-origin fallback to avoid CORS/proxy outages.
  const isCrossOrigin = configuredEndpoint.startsWith('http://') || configuredEndpoint.startsWith('https://');

  return isCrossOrigin ? [configuredEndpoint, '/api'] : [configuredEndpoint];
};

export const initOfflineQueueSync = (): void => {
  if (typeof window === 'undefined') return;
  let initialized = (window as Window & { __offlineSyncInit?: boolean }).__offlineSyncInit || false;
  if (initialized) return;
  (window as Window & { __offlineSyncInit?: boolean }).__offlineSyncInit = true;
  window.addEventListener('online', () => {
    void syncOfflineQueue();
  });
  window.addEventListener(OFFLINE_EVENT_NAMES.modeChanged, () => {
    void syncOfflineQueue();
  });
  if (isOfflineModeEnabled() && navigator.onLine) {
    void syncOfflineQueue();
  }
};
