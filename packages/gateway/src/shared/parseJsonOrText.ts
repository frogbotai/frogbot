import type { JSONValue } from 'ai';

export function parseJsonOrText(
  content: string,
): { type: 'json'; value: JSONValue } | { type: 'text'; value: string } {
  try {
    return { type: 'json', value: JSON.parse(content) as JSONValue };
  } catch {
    return { type: 'text', value: content };
  }
}
