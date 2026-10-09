export type ResendRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  redirect?: RequestRedirect;
  response?: boolean;
};

function checkUrl(url: URL | undefined): asserts url is URL {
  if (url?.origin !== 'https://api.resend.com') {
    throw new Error('[frogbot] Resend request URL must stay on https://api.resend.com.');
  }
}

function checkHeaders(names: string[]) {
  if (names.some((name) => name.toLowerCase() === 'authorization')) {
    throw new Error('[frogbot] Resend request headers must not set `Authorization`.');
  }
}

export const createResendClient = ({ apiKey }: { apiKey: string }) => ({
  authorize(url: URL, headers: Headers) {
    checkUrl(url);
    checkHeaders([...headers.keys()]);
    headers.set('authorization', `Bearer ${apiKey}`);
  },
  async request({
    body,
    headers,
    method = 'GET',
    path,
    query,
    redirect,
    response: includeResponse,
  }: ResendRequestOptions) {
    const url = path.startsWith('/') ? new URL(`https://api.resend.com${path}`) : undefined;

    checkUrl(url);
    checkHeaders(Object.keys(headers ?? {}));

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      redirect,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (redirect === 'manual' && response.status >= 300 && response.status < 400) {
      throw new Error(
        `Resend API redirected (${response.status}) to ${response.headers.get('location')}.`,
      );
    }

    const result: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        result && typeof result === 'object' && 'message' in result
          ? result.message
          : response.statusText;

      throw new Error(`Resend request failed (${response.status}): ${String(message)}`);
    }

    return includeResponse
      ? {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: result,
        }
      : result;
  },
});

export type ResendClient = ReturnType<typeof createResendClient>;
