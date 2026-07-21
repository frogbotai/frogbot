import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { runInit } from './init.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'frogbotai-gateway-init-'));

describe('runInit', () => {
  it('scaffolds a standalone gateway server project', () => {
    const cwd = scratch();
    const log = vi.fn();

    runInit({ dir: 'my-gateway', cwd, log });

    const root = join(cwd, 'my-gateway');
    const written = ['package.json', 'tsconfig.json', 'src/server.ts', '.env.example', '.gitignore', 'README.md'];
    expect(written.filter((file) => existsSync(join(root, file)))).toEqual(written);

    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      name: string;
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('my-gateway');
    expect(pkg.scripts.dev).toBe('tsx watch src/server.ts');
    expect(pkg.dependencies['@frogbotai/gateway']).toMatch(/^(\^\d|latest)/);

    const server = readFileSync(join(root, 'src/server.ts'), 'utf8');
    expect(server).toContain('createGateway');
    expect(server).toContain('fetch: gateway.handler');

    expect(log).toHaveBeenCalledWith(expect.stringContaining('next steps'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cd my-gateway'));
  });

  it('scaffolds into the current directory without a cd hint', () => {
    const cwd = scratch();
    const log = vi.fn();

    runInit({ cwd, log });

    expect(existsSync(join(cwd, 'src/server.ts'))).toBe(true);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('cd '));
  });

  it('refuses to overwrite existing files', () => {
    const cwd = scratch();
    mkdirSync(join(cwd, 'app'));
    writeFileSync(join(cwd, 'app', 'package.json'), '{}');

    expect(() => runInit({ dir: 'app', cwd, log: vi.fn() })).toThrow(/refusing to overwrite.*package\.json/);
  });
});
