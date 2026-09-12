import type { ResendClient } from './client.js';

export function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function emailBody(input: Record<string, unknown>, fallbackReplyTo = false) {
  const { content, content_type, from, from_name, ...values } = input;
  return compact({
    ...values,
    from: from_name ? `${from_name} <${from}>` : from,
    reply_to: values.reply_to ?? (fallbackReplyTo ? from : undefined),
    [content_type === 'text' ? 'text' : 'html']: content,
  });
}

export function address(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const candidate = value as { address?: string; name?: string };
  return candidate.name && candidate.address
    ? `${candidate.name} <${candidate.address}>`
    : candidate.address;
}

export function addresses(value: unknown): unknown {
  return Array.isArray(value) ? value.map(address) : address(value);
}

export function send(client: ResendClient, body: Record<string, unknown>, response = false) {
  return client.request({ method: 'POST', path: '/emails', body, response });
}
