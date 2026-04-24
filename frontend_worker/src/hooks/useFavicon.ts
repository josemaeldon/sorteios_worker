import { useEffect } from 'react';
import { callApi } from '@/lib/apiClient';

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
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url || 'data:,';
}
