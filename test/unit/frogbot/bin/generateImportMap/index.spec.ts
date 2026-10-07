import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SanitizedConfig } from 'payload';
import { generateImportMap as payloadGenerateImportMap } from 'payload';
import { format } from 'prettier';
import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest';

import { generateImportMap } from '../../../../../packages/frogbot/src/bin/generateImportMap/index.js';
import { resolveImportMapFilePath } from '../../../../../packages/frogbot/src/bin/generateImportMap/utilities/resolveImportMapFilePath.js';
import { buildConfig } from '../../../../../packages/frogbot/src/config/build.js';
import { sanitize } from '../../../../../packages/frogbot/src/config/sanitize.js';

const dirs: string[] = [];

async function makeDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);

  return dir;
}

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makePayloadConfig({
  includeNavIcons = true,
  includeSettings = true,
} = {}): Promise<SanitizedConfig> {
  const config = await buildConfig({
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as never,
    collections: [
      {
        slug: 'users',
        auth: true,
        admin: includeNavIcons ? { icon: './components/UserIcon.tsx#UserIcon' } : undefined,
        fields: [
          {
            name: 'name',
            type: 'text',
            admin: { components: { Field: './fields/NameField.tsx#NameField' } },
          } as never,
        ],
      },
    ],
    admin: {
      components: {
        ...(includeNavIcons
          ? {
              afterAccountMenu: ['./components/AfterAccount.tsx#AfterAccount'],
              afterBottomRail: ['./components/AfterBottom.tsx#AfterBottom'],
              beforeAccountMenu: ['./components/BeforeAccount.tsx#BeforeAccount'],
              beforeBottomRail: ['./components/BeforeBottom.tsx#BeforeBottom'],
              beforeSidebarClose: ['./components/BeforeClose.tsx#BeforeClose'],
              navItems: [{ icon: './components/HomeIcon.tsx#HomeIcon', label: 'Home', path: '/' }],
              navSections: ['./components/CustomSection.tsx#CustomSection'],
            }
          : {}),
        Nav: './components/Nav.tsx#CustomNav',
        logout: { Button: '/components/LogoutButton.tsx' },
        providers: ['my-ui/client#ThemeProvider'],
      },
    },
    settings: includeSettings
      ? [
          {
            label: 'Usage',
            path: 'usage/reports',
            Component: './settings/Usage.tsx#Usage',
            icon: './settings/UsageIcon.tsx#UsageIcon',
          },
        ]
      : undefined,
  });

  return config._internal.payloadConfig;
}

describe('frogbot importMap generator', () => {
  it("output matches Payload's generator for the same config, modulo header", async () => {
    const dir = await makeDir('frogbot-importmap-golden-');
    await mkdir(join(dir, 'a'));
    await mkdir(join(dir, 'b'));

    const payloadConfig = await makePayloadConfig({
      includeNavIcons: false,
      includeSettings: false,
    });

    payloadConfig.admin.importMap.baseDir = dir;
    (payloadConfig.admin.components as never as { navSections: string[] }).navSections = [];

    payloadConfig.admin.importMap.importMapFile = join(dir, 'a', 'importMap.js');
    await payloadGenerateImportMap(payloadConfig, { log: false });

    payloadConfig.admin.importMap.importMapFile = join(dir, 'b', 'importMap.js');
    const result = await generateImportMap(payloadConfig);

    const theirs = await readFile(join(dir, 'a', 'importMap.js'), 'utf-8');
    const ours = await readFile(join(dir, 'b', 'importMap.js'), 'utf-8');

    expect(result).toEqual({ changed: true, outputPath: join(dir, 'b', 'importMap.js') });
    expect(theirs).toContain("/** @type import('payload').ImportMap */");
    expect(ours).toBe(
      await format(theirs.replace("import('payload')", "import('frogbot')"), {
        parser: 'babel',
        singleQuote: true,
      }),
    );
  });

  it('emits no Payload references for a minimal frogbot config', async () => {
    const dir = await makeDir('frogbot-importmap-branding-');
    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain("from '@frogbotai/next/rsc'");
    expect(output).toContain("from '@frogbotai/next/views'");
    expect(output).not.toContain("'@frogbotai/next/views#ChatView'");
    expect(output).toContain("'@frogbotai/next/views#SettingsView'");
    expect(output).toContain("'@frogbotai/next/rsc#CollectionCards'");
    expect(output).toContain("from './fields/NameField.tsx'");
    expect(output).toContain("from './components/UserIcon.tsx'");
    expect(output).toContain("from './components/HomeIcon.tsx'");
    expect(output).toContain("from './components/CustomSection.tsx'");
    expect(output).toContain("from './components/AfterBottom.tsx'");
    expect(output).toContain("from './components/BeforeBottom.tsx'");
    expect(output).toContain("from './components/BeforeClose.tsx'");
    expect(output).toContain("from './components/AfterAccount.tsx'");
    expect(output).toContain("from './components/BeforeAccount.tsx'");
    expect(output).toContain("'/components/LogoutButton.tsx#default'");
    expect(output).toContain("from 'my-ui/client'");
    expect(output).toContain("from './settings/Usage.tsx'");
    expect(output).toContain("from './settings/UsageIcon.tsx'");
    expect(output).not.toContain('@payloadcms');
    expect(output).not.toContain("import('payload')");
  });

  it('imports object-form account-menu components when the other list is empty', async () => {
    const dir = await makeDir('frogbot-importmap-account-menu-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      admin: {
        components: {
          afterAccountMenu: [
            {
              exportName: 'SupportLink',
              path: './components/SupportLink.tsx',
              serverProps: { href: '/support' },
            },
          ],
          beforeAccountMenu: [],
        },
      },
      collections: [{ slug: 'users', auth: true, fields: [] }],
    });

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toMatch(
      /import \{ SupportLink as \w+ \} from '\.\/components\/SupportLink\.tsx'/,
    );
    expect(output).toContain("'./components/SupportLink.tsx#SupportLink':");
  });

  it('imports component icons and skips built-in icon names', async () => {
    const dir = await makeDir('frogbot-importmap-icons-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      admin: {
        components: {
          navItems: [
            { icon: 'home', label: 'Home', path: '/home' },
            { icon: './components/HomeIcon.tsx#HomeIcon', label: 'Custom', path: '/custom' },
          ],
        },
      },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'notes', admin: { icon: 'bubble-chat' }, fields: [] },
      ],
      settings: [
        { icon: 'robot', label: 'Robot', path: 'robot', Component: './settings/Robot.tsx#Robot' },
        {
          icon: './settings/UsageIcon.tsx#UsageIcon',
          label: 'Usage',
          path: 'usage',
          Component: './settings/Usage.tsx#Usage',
        },
      ],
    });

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain("from './components/HomeIcon.tsx'");
    expect(output).toContain("from './settings/UsageIcon.tsx'");
    expect(output).not.toContain("from 'home'");
    expect(output).not.toContain("from 'robot'");
    expect(output).not.toContain("from 'bubble-chat'");
  });

  it('imports component object icons and skips empty icons', async () => {
    const dir = await makeDir('frogbot-importmap-icon-objects-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      admin: {
        components: {
          navItems: [
            {
              icon: { path: './components/NavIcon.tsx', exportName: 'NavIcon' },
              label: 'A',
              path: '/a',
            },
            { icon: '', label: 'B', path: '/b' },
          ],
        },
      },
      collections: [{ slug: 'users', auth: true, fields: [] }],
      settings: [
        {
          icon: { path: './settings/UsageIcon.tsx', exportName: 'UsageIcon' },
          label: 'Usage',
          path: 'usage',
          Component: './settings/Usage.tsx#Usage',
        },
        { icon: '', label: 'Empty', path: 'empty', Component: './settings/Empty.tsx#Empty' },
      ],
    });

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toMatch(/import \{ NavIcon as \w+ \} from '\.\/components\/NavIcon\.tsx'/);
    expect(output).toMatch(/import \{ UsageIcon as \w+ \} from '\.\/settings\/UsageIcon\.tsx'/);
    expect(output).toContain("'./components/NavIcon.tsx#NavIcon':");
    expect(output).toContain("'./settings/UsageIcon.tsx#UsageIcon':");
    expect(output).not.toContain("from ''");
    expect(output).not.toContain("'':");
  });

  it('rewrites lexical components supplied by editor import-map callbacks', async () => {
    const dir = await makeDir('frogbot-importmap-lexical-');
    const payloadConfig = await makePayloadConfig({
      includeNavIcons: false,
      includeSettings: false,
    });

    const users = payloadConfig.collections.find(({ slug }) => slug === 'users');

    users?.fields.push({
      name: 'content',
      type: 'richText',
      editor: {
        generateImportMap({ addToImportMap }: { addToImportMap: (value: unknown) => void }) {
          addToImportMap([
            '@payloadcms/richtext-lexical/rsc#Field',
            { path: '@payloadcms/richtext-lexical/client#Feature' },
            '@payloadcms/richtext-lexical-other/client#Other',
          ]);
        },
      },
    } as never);

    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain("from '@frogbotai/richtext-lexical/rsc'");
    expect(output).toContain("from '@frogbotai/richtext-lexical/client'");
    expect(output).toContain("from '@payloadcms/richtext-lexical-other/client'");
    expect(output).not.toContain("from '@payloadcms/richtext-lexical/rsc'");
  });

  it('imports rich text components from object block references and dashboard fields', async () => {
    const dir = await makeDir('frogbot-importmap-nested-lexical-');
    const payloadConfig = await makePayloadConfig({
      includeNavIcons: false,
      includeSettings: false,
    });

    const makeEditor = (component: string) => ({
      generateImportMap({ addToImportMap }: { addToImportMap: (value: string) => void }) {
        addToImportMap(component);
      },
    });

    const block = {
      fields: [
        {
          name: 'copy',
          type: 'richText',
          editor: makeEditor('@payloadcms/richtext-lexical/rsc#BlockField'),
        },
      ],
      slug: 'copy',
    };

    const users = payloadConfig.collections.find(({ slug }) => slug === 'users');

    users?.fields.push({
      name: 'layout',
      type: 'blocks',
      blockReferences: [block],
      blocks: [],
    } as never);

    payloadConfig.admin.dashboard = {
      widgets: [
        {
          Component: './widgets/Content#Content',
          fields: [
            {
              name: 'intro',
              type: 'richText',
              editor: makeEditor('@payloadcms/richtext-lexical/rsc#WidgetField'),
            },
          ],
          slug: 'content',
        },
      ],
    } as never;

    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain('BlockField');
    expect(output).toContain('WidgetField');
    expect(output).toContain("from '@frogbotai/richtext-lexical/rsc'");
    expect(output).not.toContain("from '@payloadcms/richtext-lexical/rsc'");
  });

  it('maps the default chat collection edit view', async () => {
    const dir = await makeDir('frogbot-importmap-chat-views-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'conversations', chat: true, fields: [] },
      ],
    });

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain("'@frogbotai/next/views#ChatView'");
    expect(output).not.toContain('ChatListView');
  });

  it('maps the step-nav reset provider', async () => {
    const dir = await makeDir('frogbot-importmap-step-nav-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [{ slug: 'users', auth: true, fields: [] }],
    });

    const payloadConfig = await config._internal.payloadConfig;

    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain("'@frogbotai/next/client#StepNavReset'");
    expect(output).toContain("from '@frogbotai/next/client'");
  });

  it('maps dashboard widgets and their field components', async () => {
    const dir = await makeDir('frogbot-importmap-dashboard-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      admin: {
        dashboard: {
          widgets: [
            {
              Component: './components/SummaryWidget#SummaryWidget',
              fields: [
                {
                  admin: { components: { Field: './components/MetricField#MetricField' } },
                  name: 'metric',
                  type: 'text',
                },
              ],
              slug: 'summary',
            },
          ],
        },
      },
      collections: [{ slug: 'users', auth: true, fields: [] }],
    });

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain("from './components/SummaryWidget'");
    expect(output).toContain("from './components/MetricField'");
  });

  it('maps user-local and FrogBot UI field components without Payload references', async () => {
    const dir = await makeDir('frogbot-importmap-custom-fields-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [
        { slug: 'users', auth: true, fields: [] },
        {
          slug: 'posts',
          fields: [
            {
              name: 'color',
              type: 'text',
              admin: { components: { Field: '/components/ColorField#ColorField' } },
            },
            {
              name: 'summary',
              type: 'text',
              admin: { components: { Field: '@frogbotai/ui#TextField' } },
            },
          ],
        },
      ],
    });

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toMatch(/from '\.\/?\/components\/ColorField'/);
    expect(output).toContain("from '@frogbotai/ui'");
    expect(output).not.toContain('@payloadcms');
  });

  it('maps collection view, custom, Description, and edit view components', async () => {
    const dir = await makeDir('frogbot-importmap-collection-views-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [
        { slug: 'users', auth: true, fields: [] },
        {
          slug: 'posts',
          fields: [],
          admin: {
            components: {
              Description: './components/Description#Description',
              edit: { views: { details: { Component: './components/EditView#EditView' } } },
            },
            views: [
              {
                type: 'board',
                slug: 'pipeline',
                components: { Card: './components/Card#Card' },
              },
              { type: 'custom', slug: 'map', component: './components/Map#Map' },
            ],
          },
        },
      ],
    });

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toContain("from './components/Description'");
    expect(output).toContain("from './components/EditView'");
    expect(output).toContain("from './components/Card'");
    expect(output).toContain("from './components/Map'");
  });

  it('maps tool components', async () => {
    const dir = await makeDir('frogbot-importmap-tool-components-');
    const config = sanitize({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [{ slug: 'users', auth: true, fields: [] }],
      ai: { providers: { openai: true } },
      agents: [
        {
          slug: 'assistant',
          model: 'openai/gpt-4o-mini',
          instructions: 'Assist.',
          tools: [
            {
              slug: 'weather',
              description: 'Weather',
              inputSchema: {},
              execute: () => undefined,
              component: './components/Weather.tsx#Weather',
            },
          ],
        },
      ],
    } as never);

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    await expect(readFile(join(dir, 'importMap.js'), 'utf-8')).resolves.toContain(
      "from './components/Weather.tsx'",
    );
  });

  it('writes an import map when an agent model does not match the configured providers', async () => {
    const dir = await makeDir('frogbot-importmap-model-mismatch-');
    const config = sanitize(
      {
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { anthropic: true } },
        agents: [
          {
            slug: 'assistant',
            model: 'openai/gpt-4o-mini',
            instructions: 'Assist.',
          },
        ],
      },
      { mode: 'codegen' },
    );

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    const result = await generateImportMap(payloadConfig);

    expect(result).toEqual({ changed: true, outputPath: join(dir, 'importMap.js') });
    await expect(readFile(join(dir, 'importMap.js'), 'utf-8')).resolves.toContain(
      'export const importMap',
    );
  });

  it('does not import-map an agent profile avatar', async () => {
    const dir = await makeDir('frogbot-importmap-agent-profile-');
    const config = sanitize(
      {
        secret: 'test-secret',
        db: { defaultIDType: 'number' } as never,
        collections: [{ slug: 'users', auth: true, fields: [] }],
        ai: { providers: { openai: true } },
        agents: [
          {
            slug: 'assistant',
            model: 'openai/gpt-4o-mini',
            instructions: 'Assist.',
            profile: { avatar: '/agents/ada.png' },
          },
        ],
      } as never,
      { mode: 'codegen' },
    );

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    await expect(readFile(join(dir, 'importMap.js'), 'utf-8')).resolves.not.toContain(
      '/agents/ada.png',
    );
  });

  it('skips the write when output matches the existing file, and force overrides', async () => {
    const dir = await makeDir('frogbot-importmap-skip-');
    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    const first = await generateImportMap(payloadConfig);
    const second = await generateImportMap(payloadConfig);
    const forced = await generateImportMap(payloadConfig, { force: true });

    expect(first?.changed).toBe(true);
    expect(second?.changed).toBe(false);
    expect(forced?.changed).toBe(true);
  });

  it('writes the import map formatted with semicolons and single quotes', async () => {
    const dir = await makeDir('frogbot-importmap-format-');
    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    const output = await readFile(join(dir, 'importMap.js'), 'utf-8');

    expect(output).toBe(await format(output, { parser: 'babel', singleQuote: true }));
    expect(output).toMatch(/^import \{ \w+ as \w+ \} from '[^']+';$/m);
    expect(output).toMatch(/^};$/m);
  });

  it('reports stale output without writing in dry-run mode', async () => {
    const dir = await makeDir('frogbot-importmap-dry-run-');
    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    const result = await generateImportMap(payloadConfig, { dryRun: true });

    expect(result).toEqual({ changed: true, outputPath: join(dir, 'importMap.js') });
    await expect(stat(join(dir, 'importMap.js'))).rejects.toThrow();
  });

  it('returns null with ignoreResolveError when no app dir exists', async () => {
    const dir = await makeDir('frogbot-importmap-noresolve-');
    const payloadConfig = await makePayloadConfig();
    payloadConfig.admin.importMap.importMapFile = '';

    vi.stubEnv('ROOT_DIR', dir);

    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    await expect(
      generateImportMap(payloadConfig, { ignoreResolveError: true }),
    ).resolves.toBeNull();
    await expect(generateImportMap(payloadConfig)).rejects.toThrowError(
      'Could not find the import map folder',
    );
  });
});

describe('resolveImportMapFilePath', () => {
  it('resolves the default app/(frogbot) root and creates importMap.js', async () => {
    const root = await makeDir('frogbot-resolve-app-');
    await mkdir(join(root, 'app', '(frogbot)'), { recursive: true });

    const result = await resolveImportMapFilePath({ rootDir: root });

    expect(result).toBe(join(root, 'app', '(frogbot)', 'importMap.js'));
    await expect(stat(result as string)).resolves.toBeTruthy();
  });

  it('falls back to src/app/(frogbot)<adminRoute>', async () => {
    const root = await makeDir('frogbot-resolve-src-');
    await mkdir(join(root, 'src', 'app', '(frogbot)', 'admin'), { recursive: true });

    const result = await resolveImportMapFilePath({ adminRoute: '/admin', rootDir: root });

    expect(result).toBe(join(root, 'src', 'app', '(frogbot)', 'admin', 'importMap.js'));
  });

  it('honors an explicit importMapFile and creates it when missing', async () => {
    const root = await makeDir('frogbot-resolve-explicit-');
    const importMapFile = join(root, 'importMap.js');

    const result = await resolveImportMapFilePath({ importMapFile, rootDir: root });

    expect(result).toBe(importMapFile);
    await expect(stat(importMapFile)).resolves.toBeTruthy();
  });

  it('returns an Error mentioning both candidate locations when nothing resolves', async () => {
    const root = await makeDir('frogbot-resolve-missing-');

    const result = await resolveImportMapFilePath({ rootDir: root });

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain(join(root, 'app', '(frogbot)'));
    expect((result as Error).message).toContain(join(root, 'src', 'app', '(frogbot)'));
    expect((result as Error).message).not.toContain('Payload');
  });
});
