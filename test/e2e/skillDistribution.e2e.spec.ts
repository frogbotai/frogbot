import fs from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  canonicalSkill,
  claudeClient,
  clientVersion,
  createFixture,
  expectFullSkill,
  expectInstalledAgents,
  expectNoProjectSkill,
  expectProjectSkill,
  expectScaffold,
  extractCLI,
  packCLI,
  packageVersion,
  projectAgents,
  readJSON,
  repoRoot,
  run,
  scaffold,
  skillsAgents,
  skillsClient,
  successful,
  type InstallationFixture,
} from './fixtures/skill-distribution/installation/harness';

describe('skill distribution local installation', () => {
  let fixture: InstallationFixture;

  beforeAll(() => {
    if (!skillsClient) {
      console.warn('BLOCKED: set SKILL_DISTRIBUTION_SKILLS_BIN to a prepared skills executable.');
    }

    if (!claudeClient) {
      console.warn(
        'BLOCKED: set SKILL_DISTRIBUTION_CLAUDE_BIN to a prepared Claude >=2.1.233 executable.',
      );
    }
  });

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    if (fixture) fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it('exposes canonical entry bytes through the docs directory symlink', () => {
    const link = path.join(repoRoot, 'docs/.mintlify/skills');

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('../../skills');
    expect(fs.realpathSync(link)).toBe(fs.realpathSync(path.join(repoRoot, 'skills')));
    expect(fs.readFileSync(path.join(link, 'frogbot/SKILL.md'))).toEqual(
      fs.readFileSync(path.join(canonicalSkill, 'SKILL.md')),
    );
  });

  it('exposes a broken docs-subfolder target in a disposable repository', () => {
    const directory = path.join(fixture.repository, 'docs/.mintlify');
    const link = path.join(directory, 'skills');

    fs.mkdirSync(directory, { recursive: true });
    fs.symlinkSync('../skills', link, 'dir');

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('../skills');
    expect(() => fs.readFileSync(path.join(link, 'frogbot/SKILL.md'))).toThrow(/ENOENT/);
    expectFullSkill(path.join(fixture.repository, 'skills/frogbot'));
  });

  describe.skipIf(!skillsClient)(
    'prepared skills client (SKILL_DISTRIBUTION_SKILLS_BIN required)',
    () => {
      beforeEach(() => {
        expect(clientVersion(fixture, skillsClient!)).toMatch(/^\d+\.\d+\.\d+$/);

        for (const directory of [
          path.join(fixture.env.HOME!, '.cursor'),
          path.join(fixture.env.HOME!, '.gemini'),
          path.join(fixture.env.HOME!, '.copilot'),
          path.join(fixture.env.XDG_CONFIG_HOME!, 'opencode'),
        ]) {
          fs.mkdirSync(directory, { recursive: true });
        }
      });

      it('lists exactly one logical frogbot skill without installing it', () => {
        const result = successful(fixture, skillsClient!, ['add', fixture.repository, '--list']);

        expect(result.output).toMatch(/Found 1 skill/);
        expect(result.output).toMatch(/\bfrogbot\b/);
        expectNoProjectSkill(fixture.project);
        expectFullSkill(path.join(fixture.repository, 'skills/frogbot'));
      });

      it('installs all six agents with a canonical directory and Claude symlink by default', () => {
        const result = successful(fixture, skillsClient!, [
          'add',
          fixture.repository,
          '--skill',
          'frogbot',
          '--agent',
          ...skillsAgents,
          '--yes',
        ]);

        const canonical = path.join(fixture.project, '.agents/skills/frogbot');
        const claude = path.join(fixture.project, '.claude/skills/frogbot');

        expect(result.output).toContain('frogbot');
        expect(fs.lstatSync(canonical).isDirectory()).toBe(true);
        expect(fs.lstatSync(claude).isSymbolicLink()).toBe(true);
        expect(fs.realpathSync(claude)).toBe(fs.realpathSync(canonical));
        expectFullSkill(canonical);
        expectFullSkill(claude);
        expectInstalledAgents(fixture);
      });

      it('installs all six agents with independent full directories in copy mode', () => {
        successful(fixture, skillsClient!, [
          'add',
          fixture.repository,
          '--skill',
          'frogbot',
          '--agent',
          ...skillsAgents,
          '--yes',
          '--copy',
        ]);

        const canonical = path.join(fixture.project, '.agents/skills/frogbot');
        const claude = path.join(fixture.project, '.claude/skills/frogbot');

        expect(fs.lstatSync(canonical).isDirectory()).toBe(true);
        expect(fs.lstatSync(claude).isDirectory()).toBe(true);
        expect(fs.realpathSync(claude)).not.toBe(fs.realpathSync(canonical));
        expectFullSkill(canonical);
        expectFullSkill(claude);
        expectInstalledAgents(fixture);
      });
    },
  );

  describe.skipIf(!claudeClient)(
    'prepared Claude client (SKILL_DISTRIBUTION_CLAUDE_BIN required)',
    () => {
      beforeEach(() => {
        const version = clientVersion(fixture, claudeClient!);
        const [major, minor, patch] = version.split('.').map(Number);

        expect(
          major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 233))),
          `Claude ${version} lacks directory validation; prepare version >=2.1.233`,
        ).toBe(true);
      });

      it.each(['', 'skills'])('validates the real repository %s directory', (directory) => {
        const result = successful(fixture, claudeClient!, [
          'plugin',
          'validate',
          path.join(fixture.repository, directory),
        ]);

        expect(result.output).toMatch(/valid|passed/i);
        expectFullSkill(path.join(fixture.repository, 'skills/frogbot'));
      });

      it('reports invalid marketplace JSON', () => {
        const manifest = path.join(fixture.repository, '.claude-plugin/marketplace.json');

        fs.writeFileSync(manifest, '{ invalid json');

        const result = run(fixture, claudeClient!, ['plugin', 'validate', fixture.repository]);

        expect(result.status, result.diagnostic).not.toBe(0);
        expect(result.output).toMatch(/json|parse|syntax/i);
        expect(result.output).toContain('marketplace');
      });

      it('reports an invalid marketplace source', () => {
        const manifest = path.join(fixture.repository, '.claude-plugin/marketplace.json');
        const marketplace = readJSON<{ plugins: { source: unknown }[] }>(manifest);

        marketplace.plugins[0].source = 42;
        fs.writeFileSync(manifest, JSON.stringify(marketplace));

        const result = run(fixture, claudeClient!, ['plugin', 'validate', fixture.repository]);

        expect(result.status, result.diagnostic).not.toBe(0);
        expect(result.output).toMatch(/source/i);
      });

      it('registers and enables the local marketplace plugin with all skill bytes and versions', () => {
        successful(fixture, claudeClient!, ['plugin', 'marketplace', 'add', fixture.repository]);
        successful(fixture, claudeClient!, ['plugin', 'install', 'frogbot@frogbot']);

        const result = successful(fixture, claudeClient!, ['plugin', 'list', '--json']);
        const plugins = JSON.parse(result.stdout) as {
          id: string;
          version: string;
          enabled: boolean;
          installPath: string;
        }[];

        expect(plugins, result.diagnostic).toHaveLength(1);
        expect(plugins[0]).toMatchObject({
          id: 'frogbot@frogbot',
          version: packageVersion,
          enabled: true,
        });
        expect(fs.realpathSync(plugins[0].installPath)).toBe(
          fs.realpathSync(
            path.join(
              fixture.env.CLAUDE_CONFIG_DIR!,
              'plugins/cache/frogbot/frogbot',
              packageVersion,
            ),
          ),
        );
        expectFullSkill(path.join(plugins[0].installPath, 'skills/frogbot'));

        const pluginManifest = path.join(plugins[0].installPath, '.claude-plugin/plugin.json');
        const marketplaceManifest = path.join(
          plugins[0].installPath,
          '.claude-plugin/marketplace.json',
        );

        expect(readJSON<{ version: string }>(pluginManifest).version).toBe(packageVersion);
        expect(
          readJSON<{ plugins: { version: string }[] }>(marketplaceManifest).plugins[0].version,
        ).toBe(packageVersion);
        expect(fs.readFileSync(pluginManifest)).toEqual(
          fs.readFileSync(path.join(repoRoot, '.claude-plugin/plugin.json')),
        );
        expect(fs.readFileSync(marketplaceManifest)).toEqual(
          fs.readFileSync(path.join(repoRoot, '.claude-plugin/marketplace.json')),
        );

        const details = successful(fixture, claudeClient!, [
          'plugin',
          'details',
          'frogbot@frogbot',
        ]);
        const marketplaces = readJSON<{
          frogbot: { source: { source: string; path: string }; installLocation: string };
        }>(path.join(fixture.env.CLAUDE_CONFIG_DIR!, 'plugins/known_marketplaces.json'));

        expect(details.output, details.diagnostic).toContain(`frogbot ${packageVersion}`);
        expect(details.output, details.diagnostic).toMatch(/Skills \(1\)\s+frogbot/);
        expect(marketplaces.frogbot).toMatchObject({
          source: { source: 'directory', path: fixture.repository },
          installLocation: fixture.repository,
        });
      });
    },
  );

  describe('packed create-frogbot-app consumer', () => {
    let preparation: InstallationFixture;
    let tarball: string;
    let packed: string;

    beforeAll(() => {
      preparation = createFixture();
      tarball = packCLI(preparation);
    });

    beforeEach(() => {
      packed = extractCLI(fixture, tarball);
    });

    afterAll(() => {
      if (preparation) fs.rmSync(preparation.root, { recursive: true, force: true });
    });

    it('packs all 24 unchanged skill files, the blank template, bin and synchronized version', () => {
      expectFullSkill(path.join(packed, 'dist/skills/frogbot'));
      expect(readJSON<{ version: string }>(path.join(packed, 'package.json')).version).toBe(
        packageVersion,
      );
      expect(fs.statSync(path.join(packed, 'bin.js')).isFile()).toBe(true);
      expect(fs.readdirSync(path.join(packed, 'dist/templates'))).toEqual(['blank']);
      expect(
        fs.statSync(path.join(packed, 'dist/templates/blank/src/frogbot.config.ts')).isFile(),
      ).toBe(true);
      expect(fs.statSync(path.join(packed, 'dist/templates/blank/package.json')).isFile()).toBe(
        true,
      );

      const help = successful(fixture, process.execPath, [path.join(packed, 'bin.js'), '--help']);

      expect(help.output).toContain('--agents');
      expect(help.output).toContain('--no-agents');
    });

    it('scaffolds all six agents from the extracted executable with deduplicated pointers', () => {
      const project = scaffold(fixture, packed, ['--agents', projectAgents]);

      expectScaffold(project);
      expectProjectSkill(project);
    });

    it('preserves the complete skill with AI disabled', () => {
      const project = scaffold(fixture, packed, ['--agents', projectAgents, '--ai', 'none']);

      expectScaffold(project);
      expectProjectSkill(project);
      expect(fs.readFileSync(path.join(project, 'src/frogbot.config.ts'), 'utf8')).not.toMatch(
        /^  ai:/m,
      );
      expect(fs.existsSync(path.join(project, 'src/agents'))).toBe(false);
    });

    it.each([
      { name: 'default --yes', flags: [] },
      { name: '--no-agents', flags: ['--no-agents'] },
    ])('writes no skill or pointers for $name', ({ flags }) => {
      const project = scaffold(fixture, packed, flags);

      expectScaffold(project);
      expectNoProjectSkill(project);
    });

    it('warns and writes no dangling pointers when the extracted bundle is absent', () => {
      fs.rmSync(path.join(packed, 'dist/skills'), { recursive: true });

      const result = successful(fixture, process.execPath, [
        path.join(packed, 'bin.js'),
        'skill-contract',
        '--yes',
        '--no-install',
        '--no-git',
        '--agents',
        projectAgents,
      ]);

      const project = path.join(fixture.project, 'skill-contract');

      expect(result.output).toContain('skill is not bundled');
      expect(result.output).toContain('npx skills add frogbotai/frogbot');
      expectScaffold(project);
      expectNoProjectSkill(project);
      expectFullSkill(canonicalSkill);
    });
  });
});
