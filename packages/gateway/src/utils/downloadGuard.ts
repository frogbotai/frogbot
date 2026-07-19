// SSRF guard for AI SDK in-process URL downloads (G33).
//
// `/v1/messages` and `/v1/responses` accept user-supplied remote URLs for
// media (Anthropic `source: { type: 'url' }`, Responses `input_image` /
// `input_file`). When the resolved provider does not natively support URL
// file parts, the AI SDK's default download function fetches the URL from
// inside the gateway process — a classic SSRF vector against cloud metadata
// (IMDS at 169.254.169.254), loopback, and internal services.
//
// This module replaces the SDK default via the `experimental_download`
// option on `generateText`/`streamText`. URLs the model supports natively
// pass through untouched (the provider fetches server-side — its problem,
// not ours). URLs the gateway would have to fetch itself are gated:
//   1. `https:` scheme only
//   2. literal-IP AND DNS-resolved hosts must not be private / link-local /
//      loopback / CGNAT / reserved (every A/AAAA record is checked)
//   3. downloaded bytes are capped (20 MB)
//   4. each fetch hop has a hard timeout, redirects are followed manually
//      and each hop is re-validated
//
// Known limitation: DNS is resolved for validation and again by fetch
// (TOCTOU) — a fast-rebinding attacker could theoretically pass the check.
// Full mitigation requires IP pinning at the socket layer; deployments that
// need that guarantee should also constrain egress at the network layer.
// This matches the posture of comparable gateways (LiteLLM PR #26996).

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { GatewayError } from '../errors/gatewayError.js';

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

type GuardedDownload = (
  requestedDownloads: Array<{ url: URL; isUrlSupportedByModel: boolean }>,
) => Promise<Array<{ data: Uint8Array; mediaType: string | undefined } | null>>;

/**
 * Drop-in `experimental_download` for `generateText`/`streamText`.
 * Model-supported URLs pass through (`null`); everything else is fetched
 * through the SSRF gate above.
 */
export const guardedDownload: GuardedDownload = (requestedDownloads) =>
  Promise.all(
    requestedDownloads.map(async (requested) =>
      requested.isUrlSupportedByModel ? null : await fetchPublicUrl(requested.url),
    ),
  );

function downloadRejected(url: URL, reason: string): GatewayError {
  return new GatewayError({
    message: `Cannot fetch remote URL "${url}": ${reason}.`,
    status: 400,
    code: 'invalid_request_body',
  });
}

/** Throws unless the URL is https and every resolved address is public. */
export async function assertPublicHttpsUrl(url: URL): Promise<void> {
  if (url.protocol !== 'https:') {
    throw downloadRejected(url, `scheme "${url.protocol}" is not allowed (https only)`);
  }

  // URL brackets IPv6 hostnames — strip for isIP/lookup.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw downloadRejected(url, 'address is private, loopback, or link-local');
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw downloadRejected(url, 'hostname could not be resolved');
  }
  if (addresses.length === 0) {
    throw downloadRejected(url, 'hostname could not be resolved');
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw downloadRejected(url, 'hostname resolves to a private, loopback, or link-local address');
    }
  }
}

/** True for loopback, RFC-1918, link-local, CGNAT, and reserved ranges (v4 + v6). */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  // Not an IP literal at all — treat as unsafe.
  return true;
}

function isPrivateIPv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  const [a, b] = octets as [number, number];
  if (a === 0) return true; // 0.0.0.0/8 ("this network")
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT (incl. Alibaba IMDS)
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + IMDS
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24 IETF protocol
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const lower = address.toLowerCase();

  // IPv4-mapped / IPv4-translated (::ffff:a.b.c.d) — validate the embedded v4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);

  if (lower === '::' || lower === '::1') return true; // unspecified / loopback
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique local
  return false;
}

async function fetchPublicUrl(url: URL): Promise<{ data: Uint8Array; mediaType: string | undefined }> {
  let current = url;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicHttpsUrl(current);

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch {
      throw downloadRejected(url, 'fetch failed or timed out');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) {
        throw downloadRejected(url, 'redirect without a location header');
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw downloadRejected(url, `upstream returned status ${response.status}`);
    }

    return {
      data: await readCapped(response, url),
      mediaType: response.headers.get('content-type') ?? undefined,
    };
  }

  throw downloadRejected(url, 'too many redirects');
}

async function readCapped(response: Response, url: URL): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw downloadRejected(url, `content exceeds the ${MAX_DOWNLOAD_BYTES}-byte download limit`);
  }

  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done)  break;

    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw downloadRejected(url, `content exceeds the ${MAX_DOWNLOAD_BYTES}-byte download limit`);
    }
    chunks.push(value);
  }

  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}
