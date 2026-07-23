import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { scaffold } from './index.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = path.join(packageRoot, 'dist', 'templates', 'blank');
const roots: string[] = [];

function createDest(projectName = 'test-app'): { dest: string; projectName: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-'));
  roots.push(root);
  return { dest: path.join(root, projectName), projectName };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('scaffold', () => {
  it('creates the packed blank template with the project identity and root app layout', () => {
    const options = createDest('frog.test-app');

    scaffold({ ...options, templateDir });

    const pkg = JSON.parse(fs.readFileSync(path.join(options.dest, 'package.json'), 'utf8')) as {
      name: string;
      private?: boolean;
    };
    expect(pkg).toMatchObject({ name: 'frog.test-app' });
    expect(pkg.private).toBeUndefined();
    expect(fs.existsSync(path.join(options.dest, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(options.dest, 'gitignore'))).toBe(false);
    expect(fs.existsSync(path.join(options.dest, 'app'))).toBe(true);
    expect(fs.existsSync(path.join(options.dest, 'src'))).toBe(false);
    const readme = fs.readFileSync(path.join(options.dest, 'README.md'), 'utf8');
    expect(readme).toContain('pnpm 10.26 or newer');
    expect(readme).toContain('move only `app/` to\n`src/app/`');
    expect(readme).toContain('Leave `frogbot.config.ts` at the project root');
  });

  it('does not expose Payload branding in generated source files', () => {
    const options = createDest();
    scaffold({ ...options, templateDir });

    const files = fs.readdirSync(options.dest, { recursive: true, withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      const content = fs.readFileSync(path.join(file.parentPath, file.name), 'utf8');
      expect(content).not.toContain('@payloadcms/');
    }
  });

  it('rejects an existing destination without changing it', () => {
    const options = createDest();
    fs.mkdirSync(options.dest);
    const sentinel = path.join(options.dest, 'sentinel');
    fs.writeFileSync(sentinel, 'unchanged');

    expect(() => scaffold({ ...options, templateDir })).toThrow(
      'Directory "test-app" already exists.',
    );
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('unchanged');
  });

  it('surfaces a missing packed template', () => {
    const options = createDest();

    expect(() => scaffold({ ...options, templateDir: path.join(options.dest, 'missing') })).toThrow();
  });

  it('writes pnpm build approvals only to the workspace file', () => {
    const options = createDest();
    scaffold({ ...options, templateDir });

    expect(fs.readFileSync(path.join(options.dest, 'pnpm-workspace.yaml'), 'utf8')).toBe(
      'allowBuilds:\n  sharp: true\n  esbuild: true\n',
    );
    const pkg = JSON.parse(fs.readFileSync(path.join(options.dest, 'package.json'), 'utf8')) as {
      pnpm?: unknown;
    };
    expect(pkg.pnpm).toBeUndefined();
  });
});
