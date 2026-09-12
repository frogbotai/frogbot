export type ResendRequestOptions = {
  allowFailure?: boolean;
  binary?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  rawBody?: boolean;
  redirect?: RequestRedirect;
  response?: boolean;
  signal?: AbortSignal;
};

export const createResendClient = ({ apiKey }: { apiKey: string }) => ({
  async request({
    allowFailure,
    binary,
    body,
    headers,
    method = 'GET',
    path,
    query,
    rawBody,
    redirect,
    response: includeResponse,
    signal,
  }: ResendRequestOptions) {
    const url = new URL(`https://api.resend.com${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      method,
      redirect,
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined || rawBody ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: rawBody ? (body as BodyInit) : JSON.stringify(body) }),
    });
    const result: unknown = binary
      ? new Uint8Array(await response.arrayBuffer())
      : await response.json().catch(() => null);
    if (!response.ok && !allowFailure) {
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
