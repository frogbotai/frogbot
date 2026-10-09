import { twilioAuth, twilioOptions } from './config.js';

type RequestOptions = {
  body?: Record<string, unknown>;
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  service?: 'api' | 'lookup';
  binary?: boolean;
  redirect?: RequestRedirect;
};

function checkOrigin(url: URL, base: string) {
  if (url.origin !== base) {
    throw new Error(`[frogbot] Twilio request URL must stay on ${base}.`);
  }
}

export function createTwilioClient({ auth, options }: { auth: unknown; options: unknown }) {
  const { username, password } = twilioAuth.parse(auth);

  twilioOptions.parse(options);

  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  return {
    accountSid: username,
    authorize(url: URL, headers: Headers) {
      checkOrigin(url, 'https://api.twilio.com');
      headers.set('authorization', authorization);
    },
    async request({
      body,
      method = 'GET',
      path,
      query,
      service = 'api',
      binary,
      redirect,
    }: RequestOptions) {
      if (!path.startsWith('/') || path.startsWith('//')) {
        throw new Error('[frogbot] Twilio request paths must be relative to the Twilio API.');
      }

      const base = service === 'lookup' ? 'https://lookups.twilio.com' : 'https://api.twilio.com';
      const url = new URL(path, `${base}/`);

      checkOrigin(url, base);

      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }

      const form = body ? new URLSearchParams() : undefined;

      for (const [key, value] of Object.entries(body ?? {})) {
        if (value !== undefined) form?.set(key, String(value));
      }

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: authorization,
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: form,
        redirect,
      });

      if (redirect === 'manual' && response.status >= 300 && response.status < 400) {
        throw new Error(
          `Twilio API redirected (${response.status}) to ${response.headers.get('location')}.`,
        );
      }

      const result = binary
        ? new Uint8Array(await response.arrayBuffer())
        : await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          result && typeof result === 'object' && 'message' in result
            ? result.message
            : response.statusText;

        throw new Error(`Twilio request failed (${response.status}): ${String(message)}`);
      }

      return result;
    },
  };
}

export type TwilioClient = ReturnType<typeof createTwilioClient>;
