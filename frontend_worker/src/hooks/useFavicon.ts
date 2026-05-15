import { useEffect } from 'react';
import { callApi } from '@/lib/apiClient';

const DEFAULT_FAVICON = '/favicon.svg?v=system';
const DEFAULT_APPLE_TOUCH_ICON = '/apple-touch-icon.png?v=system';

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

function getMimeType(href: string) {
  const match = href.match(/^data:([^;,]+)[;,]/i);
  if (match?.[1]) return match[1].toLowerCase();
  const cleanHref = href.split('?')[0].toLowerCase();
  if (cleanHref.endsWith('.png')) return 'image/png';
  if (cleanHref.endsWith('.svg')) return 'image/svg+xml';
  if (cleanHref.endsWith('.jpg') || cleanHref.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/x-icon';
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
  const mimeType = getMimeType(baseHref);
  const appleTouchHref = withCacheBust(url || DEFAULT_APPLE_TOUCH_ICON);

  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"], link[rel="alternate icon"]'
    )
    .forEach((el) => el.parentElement?.removeChild(el));

  appendIconLink('icon', href, mimeType, 'any');
  appendIconLink('shortcut icon', href, mimeType, 'any');
  appendIconLink('apple-touch-icon', appleTouchHref, url ? mimeType : 'image/png', '180x180');

  const maskIcon = document.createElement('link');
  maskIcon.rel = 'mask-icon';
  maskIcon.href = href;
  maskIcon.setAttribute('color', '#1d4ed8');
  document.head.appendChild(maskIcon);
}
