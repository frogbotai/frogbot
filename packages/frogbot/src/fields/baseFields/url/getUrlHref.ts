const blocked = /[\s\p{Cc}]/u;
const full = /^https?:\/\//i;

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function getUrlHref({ value }: { value: unknown }): string | undefined {
  if (typeof value !== 'string' || value === '' || blocked.test(value)) return undefined;

  if (full.test(value)) {
    const url = parseUrl(value);

    return url && (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname
      ? value
      : undefined;
  }

  if (!/^[\p{L}\p{N}]/u.test(value)) return undefined;

  const href = `https://${value}`;
  const url = parseUrl(href);

  if (!url || url.username || url.password || !url.hostname.includes('.')) return undefined;

  return href;
}
