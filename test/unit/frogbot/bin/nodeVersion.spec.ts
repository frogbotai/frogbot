import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const binPath = fileURLToPath(new URL('../../../../packages/frogbot/bin.js', import.meta.url));
const packageJSON = new URL('../../../../packages/frogbot/package.json', import.meta.url);

const guardMessage = /needs Node\.js/;

async function minimumNode() {
  const manifest = JSON.parse(await readFile(packageJSON, 'utf8')) as {
    engines: { node: string };
  };

  const match = /^>=(\d+\.\d+\.\d+)$/.exec(manifest.engines.node);

  if (!match?.[1]) throw new Error(`unexpected engines.node: ${manifest.engines.node}`);

  return match[1];
}

function runBin(nodeVersion: string) {
  const fake = `Object.defineProperty(process, 'versions', { value: { ...process.versions, node: ${JSON.stringify(nodeVersion)} } });`;

  return execFileAsync(process.execPath, [
    '--import',
    `data:text/javascript,${encodeURIComponent(fake)}`,
    binPath,
  ]).then(
    ({ stderr }) => ({ code: 0, stderr }),
    (error: { code: number; stderr: string }) => ({ code: error.code, stderr: error.stderr }),
  );
}

describe('frogbot bin.js Node version guard', () => {
  it('exits 1 with a one-line error on Node 22.17.0', async () => {
    const result = await runBin('22.17.0');

    expect(result.code).toBe(1);
    expect(result.stderr.trimEnd().split('\n')).toEqual([
      `[frogbot] error: FrogBot needs Node.js ${await minimumNode()} or newer, but this is Node.js 22.17.0. Upgrade Node.js (in Docker, set NODE_VERSION to 24).`,
    ]);
  });

  it('refuses one patch below engines.node', async () => {
    const [major, minor, patch] = (await minimumNode()).split('.').map(Number);
    const below = patch ? `${major}.${minor}.${patch - 1}` : `${major}.${minor - 1}.99`;
    const result = await runBin(below);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(guardMessage);
  });

  it('lets the engines.node minimum through to the CLI', async () => {
    const result = await runBin(await minimumNode());

    expect(result.stderr).not.toMatch(guardMessage);
  }, 20_000);
});
