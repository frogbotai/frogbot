import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, it } from 'vitest';

const stopModule = pathToFileURL(resolve('packages/frogbot/dist/jobs/stop.js')).href;

type Exit = { code: number | null; signal: NodeJS.Signals | null; stdout: string };

function server(body: string): Promise<Exit> {
  const file = join(mkdtempSync(join(tmpdir(), 'frogbot-stop-')), 'server.mjs');

  writeFileSync(
    file,
    `import { trackJobs, holdLease } from ${JSON.stringify(stopModule)};
const payload = { crons: [{ stop() {} }] };
${body}
console.log('ready');
`,
  );

  return new Promise((done) => {
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const ready = !stdout.includes('ready');

      stdout += chunk.toString();

      if (ready && stdout.includes('ready')) child.kill('SIGTERM');
    });

    child.on('exit', (code, signal) => done({ code, signal, stdout }));
  });
}

it('alone, a release that hangs with nothing else alive still ends in death by SIGTERM', async () => {
  const result = await server(`
trackJobs({ payload, release: () => new Promise(() => {}) });
holdLease({ payload, token: 'a' });
setTimeout(() => {}, 500);
`);

  expect({ code: result.code, signal: result.signal }).toEqual({ code: null, signal: 'SIGTERM' });
});

it('a SIGTERM listener registered earlier that exits at once still waits for the release', async () => {
  const result = await server(`
process.on('SIGTERM', () => process.exit(0));
trackJobs({ payload, release: async (tokens) => console.log('released ' + tokens.join(',')) });
holdLease({ payload, token: 'a' });
setInterval(() => {}, 1000);
`);

  expect(result.code).toBe(0);
  expect(result.stdout).toContain('released a');
});
