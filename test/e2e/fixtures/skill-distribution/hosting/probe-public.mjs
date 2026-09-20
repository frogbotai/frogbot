import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const canonical = resolve(import.meta.dirname, '../../../../../skills/frogbot');
const entry = readFileSync(join(canonical, 'SKILL.md'), 'utf8');
const fallbacks = [
  ...entry.matchAll(
    /https:\/\/raw\.githubusercontent\.com\/frogbotai\/frogbot\/main\/skills\/frogbot\/reference\/[A-Z-]+\.md/g,
  ),
].map((match) => match[0]);
const origin = 'https://docs.frogbot.ai';
const modern = `${origin}/.well-known/agent-skills/index.json`;
const legacy = `${origin}/.well-known/skills/index.json`;
const urls = [
  ...fallbacks,
  modern,
  legacy,
  `${origin}/.well-known/skills/frogbot/SKILL.md`,
  `${origin}/.well-known/skills/frogbot/skill.md`,
  `${origin}/skills/coding-agents`,
  `${origin}/llms.txt`,
  'https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/SKILL.md',
];
const results = [];

if (fallbacks.length !== 23 || new Set(fallbacks).size !== 23) {
  throw new Error('Expected exactly 23 canonical raw fallback URLs');
}

async function probe(url) {
  const started = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
      headers: { 'user-agent': 'FrogBot-Ticket129-hosted-acceptance' },
    });
    const chunks = [];
    let size = 0;

    for await (const chunk of response.body) {
      size += chunk.length;

      if (size > 2 * 1024 * 1024) throw new Error('Response exceeds 2 MiB bound');

      chunks.push(chunk);
    }

    const bytes = Buffer.concat(chunks);
    const text = bytes.toString();
    const result = {
      url,
      finalURL: response.url,
      status: response.status,
      bytes: size,
      contentType: response.headers.get('content-type'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      milliseconds: Date.now() - started,
    };

    if (url === modern || url === legacy) {
      const index = JSON.parse(text);

      result.schema = index.$schema;
      result.skills = index.skills;
    }

    if (fallbacks.includes(url) && response.ok) {
      result.matchesCanonical = bytes.equals(
        readFileSync(join(canonical, 'reference', url.split('/').at(-1))),
      );
    }

    if (url.endsWith('/SKILL.md') && response.ok) {
      result.matchesCanonical = text === entry;
      result.name = text.match(/^name:\s*(.+)$/m)?.[1];
    }

    if (url.endsWith('/llms.txt')) {
      result.includesCodingAgents = text.includes('/skills/coding-agents');
    }

    results.push(result);
    console.log(JSON.stringify(result));

    return result;
  } catch (error) {
    const result = { url, error: String(error), milliseconds: Date.now() - started };

    results.push(result);
    console.log(JSON.stringify(result));

    return result;
  }
}

let next = 0;

await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < urls.length) {
      const url = urls[next++];

      await probe(url);
    }
  }),
);

const intended = results
  .find((result) => result.url === modern)
  ?.skills?.find((skill) => skill.name === 'frogbot');

if (intended?.url) {
  const advertised = new URL(intended.url, modern);

  if (advertised.origin !== origin) {
    throw new Error(`Unexpected advertised origin: ${advertised.origin}`);
  }

  const fetched = await probe(advertised.href);

  console.log(
    JSON.stringify({
      advertisedDigest: intended.digest,
      digestMatches: intended.digest === `sha256:${fetched.sha256}`,
    }),
  );
} else {
  console.log(
    JSON.stringify({
      blocker: 'Public v0.2 index does not advertise frogbot; no other skill installed or fetched',
    }),
  );
}

console.log(
  JSON.stringify({
    checkedAt: new Date().toISOString(),
    rawFallbacks: results
      .filter((result) => fallbacks.includes(result.url))
      .map(({ url, status, error }) => ({ url, status, error })),
  }),
);
