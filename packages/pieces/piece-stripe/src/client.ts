import type { PieceJSON } from 'frogbot/pieces';

export type StripeAuth = { apiKey: string };

export type StripeResponse = Record<string, PieceJSON>;

function appendValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => appendValue(params, `${key}[${index}]`, item));

    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([childKey, childValue]) => {
      appendValue(params, `${key}[${childKey}]`, childValue);
    });

    return;
  }

  params.append(key, String(value));
}

function encode(values: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => appendValue(params, key, value));

  return params;
}

export function createStripeClient({ auth }: { auth: StripeAuth }) {
  const baseUrl = 'https://api.stripe.com/v1';

  async function request(
    path: string,
    method: 'DELETE' | 'GET' | 'POST' = 'GET',
    values: Record<string, unknown> = {},
  ): Promise<StripeResponse> {
    const response = await requestResponse(path, method, values);

    return response.body;
  }

  async function requestResponse(
    path: string,
    method: 'DELETE' | 'GET' | 'POST' = 'GET',
    values: Record<string, unknown> = {},
  ) {
    const url = new URL(path.replace(/^\//, ''), `${baseUrl}/`);
    const params = encode(values);

    if (method === 'GET') url.search = params.toString();

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        ...(method !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(method !== 'GET' ? { body: params } : {}),
    });
    const data = (await response.json()) as StripeResponse;

    if (!response.ok) {
      const error = data.error as { message?: unknown } | undefined;
      const message = typeof error?.message === 'string' ? error.message : response.statusText;

      throw new Error(`Stripe request failed (${response.status}): ${message}`);
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: data,
    };
  }

  return {
    request,
    requestResponse,
    async options(resource: string, label: (item: StripeResponse) => string) {
      const response = await request(resource, 'GET', { limit: 100 });
      const data = Array.isArray(response.data) ? (response.data as StripeResponse[]) : [];

      return data
        .filter((item) => typeof item.id === 'string')
        .map((item) => ({ value: item.id as string, label: label(item) }));
    },
    async subscribe(event: string, webhookUrl: string) {
      return request('webhook_endpoints', 'POST', {
        enabled_events: [event],
        url: webhookUrl,
      });
    },
    async unsubscribe(webhookId: string) {
      await request(`webhook_endpoints/${encodeURIComponent(webhookId)}`, 'DELETE');
    },
  };
}

export type StripeClient = ReturnType<typeof createStripeClient>;
