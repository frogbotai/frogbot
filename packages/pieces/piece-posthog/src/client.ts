export type PosthogRequest = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
};

function posthogUrl(path: string) {
  if (/[\\\s\p{Cc}]/u.test(path[0] ?? '') || path.startsWith('//')) {
    throw new Error('Path must target the PostHog API.');
  }

  const url = new URL(path.startsWith('/') ? `https://app.posthog.com${path}` : path);

  if (url.origin !== 'https://app.posthog.com' || url.username || url.password || url.hash) {
    throw new Error('Path must target the PostHog API.');
  }

  return url;
}

export function createPosthogClient({ personalApiKey }: { personalApiKey: string }) {
  return {
    personalApiKey,
    async request({ body, headers, method = 'GET', path, query }: PosthogRequest) {
      const url = posthogUrl(path);

      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }

      const response = await fetch(url, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${personalApiKey}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let result: unknown = null;

      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          result = text;
        }
      }

      if (!response.ok) {
        const detail =
          result && typeof result === 'object' && 'detail' in result
            ? (result as { detail: unknown }).detail
            : result;

        throw new Error(
          `PostHog request failed (${response.status}): ${typeof detail === 'string' ? detail : response.statusText}`,
        );
      }

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: result,
      };
    },
  };
}

export type PosthogClient = ReturnType<typeof createPosthogClient>;
