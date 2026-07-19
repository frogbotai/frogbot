import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadLayeredConfig } from './layered.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'frogbotai-gateway-layered-'));

describe('loadLayeredConfig', () => {
  it('merges defaults, explicit config, project config, then inline env content', async () => {
    const dir = scratch();
    const project = join(dir, 'project');
    mkdirSync(project);
    const explicit = join(dir, 'explicit.gateway.config.json');
    writeFileSync(explicit, JSON.stringify({ providers: { openai: { baseURL: 'https://explicit.test/v1' } }, logger: { level: 'debug' } }));
    writeFileSync(join(project, 'gateway.config.json'), JSON.stringify({ providers: { openai: { organization: 'project-org' } }, logger: { level: 'warn' } }));

    const result = await loadLayeredConfig({
      cwd: project,
      defaults: { providers: { openai: { apiKey: 'default-key' } }, logger: { level: 'info' } },
      configPath: explicit,
      env: {
        GATEWAY_CONFIG_JSON: JSON.stringify({ providers: { openai: { apiKey: '{env:FROGBOTAI_INLINE_KEY}' } }, tracing: { endpoint: 'http://otel.test' } }),
        FROGBOTAI_INLINE_KEY: 'inline-key',
      },
    });

    expect(result.config.providers.openai).toEqual({
      apiKey: 'inline-key',
      baseURL: 'https://explicit.test/v1',
      organization: 'project-org',
    });
    expect(result.config.logger).toEqual({ level: 'debug' });
    expect(result.config.tracing).toEqual({ endpoint: 'http://otel.test' });
    expect(result.sources.map((source) => source.kind)).toEqual(['defaults', 'project', 'env', 'inline']);
  });

  it('lets explicit config win over project config on a conflicting key (P2-D6e)', async () => {
    const dir = scratch();
    const project = join(dir, 'project');
    mkdirSync(project);
    const explicit = join(dir, 'explicit.gateway.config.json');
    writeFileSync(explicit, JSON.stringify({ providers: { openai: { apiKey: 'x', organization: 'explicit-org' } }, logger: { level: 'debug' } }));
    writeFileSync(join(project, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'x', organization: 'project-org' } }, logger: { level: 'warn' } }));

    const result = await loadLayeredConfig({ cwd: project, configPath: explicit, env: {} });

    expect(result.config.providers.openai.organization).toBe('explicit-org');
    expect(result.config.logger).toEqual({ level: 'debug' });
  });

  it('loads global config from XDG_CONFIG_HOME when set (P2-D6f)', async () => {
    const dir = scratch();
    const project = join(dir, 'project');
    mkdirSync(project);
    const xdg = join(dir, 'xdg');
    mkdirSync(join(xdg, 'frogbotai'), { recursive: true });
    const global = join(xdg, 'frogbotai', 'gateway.json');
    writeFileSync(global, JSON.stringify({ providers: { openai: { apiKey: 'global-key' } } }));

    const result = await loadLayeredConfig({ cwd: project, env: { XDG_CONFIG_HOME: xdg } });

    expect(result.config.providers.openai).toEqual({ apiKey: 'global-key' });
    expect(result.sources).toContainEqual({ kind: 'global', path: global });
  });

  it('treats an empty XDG_CONFIG_HOME as unset and does not pick up its directory (P2-D6f)', async () => {
    const dir = scratch();
    const project = join(dir, 'project');
    mkdirSync(project);

    const result = await loadLayeredConfig({ cwd: project, env: { XDG_CONFIG_HOME: '' } });

    expect(result.sources.some((source) => source.kind === 'global')).toBe(false);
  });

  it('uses only the first-priority config name when a directory has both .ts and .json', async () => {
    const dir = scratch();
    const project = join(dir, 'project');
    mkdirSync(project);
    writeFileSync(join(project, 'gateway.config.ts'), `export default { providers: { openai: { apiKey: 'ts-key' } } };\n`);
    writeFileSync(join(project, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'json-key', organization: 'json-org' } } }));

    const result = await loadLayeredConfig({ cwd: project, env: {} });

    expect(result.config.providers.openai).toEqual({ apiKey: 'ts-key' });
    const projectSources = result.sources.filter((source) => source.kind === 'project');
    expect(projectSources).toEqual([{ kind: 'project', path: join(project, 'gateway.config.ts') }]);
  });

  it('lets nearer directories override farther ones', async () => {
    const dir = scratch();
    const outer = join(dir, 'outer');
    const inner = join(outer, 'inner');
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(outer, 'package.json'), '{}');
    writeFileSync(join(outer, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'outer-key', organization: 'outer-org' } } }));
    writeFileSync(join(inner, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'inner-key' } } }));

    const result = await loadLayeredConfig({ cwd: inner, env: {} });

    expect(result.config.providers.openai).toEqual({ apiKey: 'inner-key', organization: 'outer-org' });
    const projectPaths = result.sources.filter((source) => source.kind === 'project').map((source) => source.path);
    expect(projectPaths).toEqual([join(outer, 'gateway.config.json'), join(inner, 'gateway.config.json')]);
  });

  it('does not walk past the project root into ancestor directories (G92)', async () => {
    const dir = scratch();
    const outer = join(dir, 'outer');
    const project = join(outer, 'project');
    mkdirSync(project, { recursive: true });
    // Ancestor config above the project root — must NOT be discovered.
    writeFileSync(join(outer, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'ancestor-key', organization: 'ancestor-org' } } }));
    // `.git` marks the project root; the walk must stop here.
    mkdirSync(join(project, '.git'));
    writeFileSync(join(project, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'project-key' } } }));

    const result = await loadLayeredConfig({ cwd: project, env: {} });

    expect(result.config.providers.openai).toEqual({ apiKey: 'project-key' });
    const projectPaths = result.sources.filter((source) => source.kind === 'project').map((source) => source.path);
    expect(projectPaths).toEqual([join(project, 'gateway.config.json')]);
  });

  it('stops at a package.json project root when no .git is present (G92)', async () => {
    const dir = scratch();
    const outer = join(dir, 'outer');
    const project = join(outer, 'project');
    mkdirSync(project, { recursive: true });
    writeFileSync(join(outer, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'ancestor-key' } } }));
    writeFileSync(join(project, 'package.json'), '{}');
    writeFileSync(join(project, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'project-key' } } }));

    const result = await loadLayeredConfig({ cwd: project, env: {} });

    expect(result.config.providers.openai).toEqual({ apiKey: 'project-key' });
  });

  it('honors GATEWAY_CONFIG_ROOT as an explicit discovery boundary (G92)', async () => {
    const dir = scratch();
    const outer = join(dir, 'outer');
    const inner = join(outer, 'inner');
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(outer, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'outer-key', organization: 'outer-org' } } }));
    writeFileSync(join(inner, 'gateway.config.json'), JSON.stringify({ providers: { openai: { apiKey: 'inner-key' } } }));

    const result = await loadLayeredConfig({ cwd: inner, env: { GATEWAY_CONFIG_ROOT: outer } });

    expect(result.config.providers.openai).toEqual({ apiKey: 'inner-key', organization: 'outer-org' });
    const projectPaths = result.sources.filter((source) => source.kind === 'project').map((source) => source.path);
    expect(projectPaths).toEqual([join(outer, 'gateway.config.json'), join(inner, 'gateway.config.json')]);
  });

  it('labels a malformed GATEWAY_CONFIG_JSON parse error with its source (D5a)', async () => {
    const dir = scratch();
    await expect(
      loadLayeredConfig({
        cwd: dir,
        env: { GATEWAY_CONFIG_JSON: '{"providers": {' },
      }),
    ).rejects.toThrow(/GATEWAY_CONFIG_JSON: invalid JSON/);
  });

  it('labels a trailing-comma GATEWAY_CONFIG_JSON error with its source (D5a)', async () => {
    const dir = scratch();
    await expect(
      loadLayeredConfig({
        cwd: dir,
        env: { GATEWAY_CONFIG_JSON: '{"providers": {},}' },
      }),
    ).rejects.toThrow(/GATEWAY_CONFIG_JSON: invalid JSON/);
  });

  it('rejects a GATEWAY_CONFIG_JSON array with a clear error (P2-D6c)', async () => {
    const dir = scratch();
    await expect(
      loadLayeredConfig({ cwd: dir, env: { GATEWAY_CONFIG_JSON: '[]' } }),
    ).rejects.toThrow(/GATEWAY_CONFIG_JSON: expected a JSON object, got array/);
  });

  it('rejects a GATEWAY_CONFIG_JSON scalar with a clear error (P2-D6c)', async () => {
    const dir = scratch();
    await expect(
      loadLayeredConfig({ cwd: dir, env: { GATEWAY_CONFIG_JSON: '42' } }),
    ).rejects.toThrow(/GATEWAY_CONFIG_JSON: expected a JSON object, got number/);
  });
});
