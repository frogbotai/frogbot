/**
 * Parse a data URL into its mediaType and base64 data.
 * Non-base64 data URLs are rejected — providers universally expect base64.
 */
export function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  if (!url.startsWith('data:')) return null;
  const commaIdx = url.indexOf(',');
  if (commaIdx === -1) return null;

  const header = url.slice(5, commaIdx);
  const payload = url.slice(commaIdx + 1);

  const segments = header.split(';');
  const isBase64 = segments[segments.length - 1] === 'base64';
  if (!isBase64) return null;

  const mediaType = segments[0] || 'application/octet-stream';
  return { mediaType, data: payload };
}
