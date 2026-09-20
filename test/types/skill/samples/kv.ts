import type { FrogbotInstance } from 'frogbot';

export async function useKV(frogbot: FrogbotInstance) {
  await frogbot.kv.set('settings', { theme: 'dark' });

  const settings = await frogbot.kv.get('settings');
  const exists = await frogbot.kv.has('settings');
  const keys = await frogbot.kv.keys();

  await frogbot.kv.delete('settings');
  await frogbot.kv.clear();

  return { settings, exists, keys };
}

export async function conditionalWrite(frogbot: FrogbotInstance) {
  await frogbot.kv.set('temporary', 'value', { ttl: 60_000 });

  const claimed = await frogbot.kv.setIfAbsent('worker', 'worker-1', {
    ttl: 30_000,
  });

  return claimed;
}

export async function lockReport(frogbot: FrogbotInstance) {
  const result = await frogbot.kv.lock('report:123', 30_000, async ({ signal }) => {
    const response = await fetch('https://example.com/reports/123', { signal });

    return response.json();
  });

  return result;
}
