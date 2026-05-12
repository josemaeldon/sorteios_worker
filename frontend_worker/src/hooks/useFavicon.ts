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
        applyFavicon(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);
}

function withCacheBust(url: string) {
  const token = `fv=${Date.now()}`;
  return url.includes('?') ? `${url}&${token}` : `${url}?${token}`;
}

function appendIconLink(rel: string, href: string, type?: string, sizes?: string) {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (type) link.type = type;
  if (sizes) link.sizes = sizes;
  document.head.appendChild(link);
}

export function applyFavicon(url: string | null) {
  const baseHref = url || DEFAULT_FAVICON;
  const href = withCacheBust(baseHref);

  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"], link[rel="alternate icon"]'
    )
    .forEach((el) => el.parentElement?.removeChild(el));

  appendIconLink('icon', href, 'image/x-icon');
  appendIconLink('shortcut icon', href, 'image/x-icon');
  appendIconLink('apple-touch-icon', href, undefined, '180x180');

  const maskIcon = document.createElement('link');
  maskIcon.rel = 'mask-icon';
  maskIcon.href = href;
  maskIcon.color = '#1d4ed8';
  document.head.appendChild(maskIcon);
}
