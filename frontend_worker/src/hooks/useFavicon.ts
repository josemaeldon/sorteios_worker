import { useEffect } from 'react';
import { callApi } from '@/lib/apiClient';

const DEFAULT_FAVICON = '/favicon.ico?v=system';

export function useFavicon() {
  useEffect(() => {
    let cancelled = false;

    callApi('getPublicConfiguracoes')
      .then((result) => {
        if (cancelled) return;
        const data = (result as { data?: { favicon_url?: string | null } }).data;
        const faviconUrl = data?.favicon_url;
        applyFavicon(faviconUrl || null);
      })
      .catch((err) => {
        console.error('useFavicon: failed to load public config', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);
}

export function applyFavicon(url: string | null) {
  const href = url || DEFAULT_FAVICON;
  const ensureLink = (rel: string) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
  };

  ensureLink('icon');
  ensureLink('shortcut icon');

  let appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!appleTouchIcon) {
    appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    document.head.appendChild(appleTouchIcon);
  }
  appleTouchIcon.href = href;
}
