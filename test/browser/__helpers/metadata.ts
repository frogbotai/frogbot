import { type APIRequestContext, expect } from '@playwright/test';

export type PageMetadata = {
  titles: string[];
  ogTitle: string | undefined;
  description: string | undefined;
  keywords: string | undefined;
  contents: string[];
};

const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};

function decode(text: string) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => entities[entity] ?? entity);
}

function readAttribute(tag: string, name: string) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);

  return match ? decode(match[1] ?? match[2] ?? '') : undefined;
}

export function readMetadata(html: string): PageMetadata {
  const titles = [...html.matchAll(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/gi)].map(([, text]) =>
    decode(text ?? ''),
  );

  const tags = [...html.matchAll(/<meta\s[^>]*>/gi)].map(([tag]) => tag);

  const content = (attribute: 'name' | 'property', value: string) =>
    readAttribute(tags.find((tag) => readAttribute(tag, attribute) === value) ?? '', 'content');

  return {
    titles,
    ogTitle: content('property', 'og:title'),
    description: content('name', 'description'),
    keywords: content('name', 'keywords'),
    contents: tags.flatMap((tag) => readAttribute(tag, 'content') ?? []),
  };
}

export async function fetchMetadata(request: APIRequestContext, path: string) {
  const response = await request.get(path);

  expect(response.headers()['content-type']).toContain('text/html');

  return readMetadata(await response.text());
}

export function metadataValues({ titles, contents }: PageMetadata) {
  return [...titles, ...contents];
}
