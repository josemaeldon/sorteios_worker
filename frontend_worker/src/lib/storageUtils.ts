export const isQuotaExceededError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; code?: number };
  return err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014;
};

export const safeLocalStorageSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const safeLocalStorageRemoveItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore remove failures.
  }
};

export const clearLocalStoragePrefix = (prefix: string): number => {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => {
      localStorage.removeItem(key);
      removed += 1;
    });
  } catch {
    // Ignore enumeration failures.
  }
  return removed;
};
