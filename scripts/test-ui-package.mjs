import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const packageRoot = path.join(repoRoot, 'packages/ui');
const protocolRoot = path.join(repoRoot, 'packages/protocol');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frogbot-ui-'));
const appRoot = path.join(temporaryRoot, 'app');
const extractedRoot = path.join(temporaryRoot, 'package');
const protocolPackRoot = path.join(temporaryRoot, 'protocol');
const protocolExtractedRoot = path.join(protocolPackRoot, 'package');
const installedFields = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const restDeclarations = /^dist\/(?:chat\/rest\/|exports\/chat-rest\.d\.ts$)/;
const serverImport =
  /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](?:frogbot|@frogbotai\/sdk)(?:\/[^'"]*)?['"]/m;

const subpaths = [
  '.',
  './icons',
  './icons/*',
  './icons/registry',
  './theme',
  './chat',
  './chat/rest',
  './chat/tools',
  './chat/artifacts',
  './shared',
  './rsc',
];

const run = (command, args, cwd = repoRoot) => {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
};

try {
  run('pnpm', ['--filter', '@frogbotai/protocol', '--filter', '@frogbotai/ui', 'build']);
  run('pnpm', ['pack', '--pack-destination', temporaryRoot], packageRoot);
  fs.mkdirSync(protocolPackRoot);
  run('pnpm', ['pack', '--pack-destination', protocolPackRoot], protocolRoot);

  const tarball = fs.readdirSync(temporaryRoot).find((file) => file.endsWith('.tgz'));
  const protocolTarball = fs.readdirSync(protocolPackRoot).find((file) => file.endsWith('.tgz'));
  assert.ok(tarball);
  assert.ok(protocolTarball);
  run('tar', ['-xzf', path.join(temporaryRoot, tarball), '-C', temporaryRoot]);
  run('tar', ['-xzf', path.join(protocolPackRoot, protocolTarball), '-C', protocolPackRoot]);

  const packageJSON = JSON.parse(fs.readFileSync(path.join(extractedRoot, 'package.json'), 'utf8'));
  const protocolJSON = JSON.parse(
    fs.readFileSync(path.join(protocolExtractedRoot, 'package.json'), 'utf8'),
  );

  for (const field of installedFields) {
    assert.equal(protocolJSON[field], undefined, `@frogbotai/protocol must not declare ${field}`);

    assert.ok(
      !Object.hasOwn(packageJSON[field] ?? {}, 'frogbot'),
      `@frogbotai/ui ${field} names frogbot`,
    );
  }

  assert.ok(!Object.hasOwn(packageJSON.peerDependenciesMeta ?? {}, 'frogbot'));
  assert.equal(packageJSON.dependencies['@frogbotai/protocol'], protocolJSON.version);

  const serverImports = fs
    .readdirSync(extractedRoot, { recursive: true })
    .filter((file) => file.endsWith('.d.ts') && !restDeclarations.test(file))
    .filter((file) => serverImport.test(fs.readFileSync(path.join(extractedRoot, file), 'utf8')));

  assert.deepEqual(serverImports, [], 'these declarations import frogbot or @frogbotai/sdk');

  assert.deepEqual(
    Object.keys(packageJSON.exports).sort(),
    [...subpaths, './styles.css', './utilities.css'].sort(),
  );

  for (const subpath of subpaths) {
    const entry = packageJSON.exports[subpath];
    assert.equal(typeof entry, 'object');
    if (subpath.includes('*')) continue;
    assert.ok(fs.statSync(path.join(extractedRoot, entry.import)).isFile());
    assert.ok(fs.statSync(path.join(extractedRoot, entry.types)).isFile());
  }

  const cssFiles = fs
    .readdirSync(extractedRoot, { recursive: true })
    .filter((file) => file.endsWith('.css'));

  assert.ok(cssFiles.includes('src/layers.css'));
  assert.ok(cssFiles.includes('src/styles.css'));
  assert.ok(cssFiles.includes('src/utilities.css'));
  assert.ok(fs.statSync(path.join(extractedRoot, 'src/styles.css')).size > 0);
  assert.ok(fs.statSync(path.join(extractedRoot, 'src/utilities.css')).size > 0);
  const css = fs.readFileSync(path.join(extractedRoot, 'src/styles.css'), 'utf8');
  assert.ok(css.startsWith('@import "./layers.css";\n'));
  assert.match(css, /@import "\.\/utilities\.css"/);
  assert.match(css, /var\(--background\)/);

  const clientEntry = fs.readFileSync(path.join(extractedRoot, 'dist/placeholder.js'), 'utf8');
  assert.equal(clientEntry.split('\n')[0], "'use client';");

  fs.mkdirSync(path.join(appRoot, 'src'), { recursive: true });
  fs.copyFileSync(path.join(temporaryRoot, tarball), path.join(appRoot, tarball));

  fs.copyFileSync(
    path.join(protocolPackRoot, protocolTarball),
    path.join(appRoot, protocolTarball),
  );

  fs.writeFileSync(
    path.join(appRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'frogbot-ui-vite-smoke',
        private: true,
        type: 'module',
        scripts: { build: 'tsc --noEmit && vite build' },
        dependencies: {
          '@frogbotai/protocol': `./${protocolTarball}`,
          '@frogbotai/ui': `./${tarball}`,
          '@types/json-schema': '^7.0.15',
          '@types/node': '^22.10.2',
          '@types/react': '19.2.14',
          '@types/react-dom': '19.2.3',
          react: '19.2.6',
          'react-dom': '19.2.6',
          typescript: '5.6.2',
          'typescript-lib-check': 'npm:typescript@5.9.3',
          vite: '^6.0.0',
        },
        pnpm: { overrides: { '@frogbotai/protocol': `file:./${protocolTarball}` } },
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(appRoot, 'index.html'),
    '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
  );

  fs.writeFileSync(
    path.join(appRoot, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          lib: ['ES2022', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(appRoot, 'src/main.tsx'),
    `import { Button, Card, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sidebar, SidebarInset, SidebarProvider } from '@frogbotai/ui'
import * as artifacts from '@frogbotai/ui/chat/artifacts'
import * as chat from '@frogbotai/ui/chat'
import { iconNames } from '@frogbotai/ui/icons/registry'
import { ThemeProvider } from '@frogbotai/ui/theme'
import * as tools from '@frogbotai/ui/chat/tools'
import '@frogbotai/ui/styles.css'
import { createRoot } from 'react-dom/client'

void [artifacts, iconNames, tools]

const adapter: chat.ChatPlatformAdapter = {
  loadManifest: async () => ({
    defaultAgent: 'local',
    agents: [{ slug: 'local', label: 'Local', source: 'config', defaultModel: 'openai/gpt-4o', models: ['openai/gpt-4o'] }],
    transcribe: false,
  }),
  createTransport: () => ({ sendMessages: async () => new ReadableStream(), reconnectToStream: async () => null }),
  listChats: async ({ page }) => ({ docs: [], page, totalDocs: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false }),
  getChat: async (id) => ({ id, agent: 'local' }),
  loadMessages: async () => ({ messages: [], queued: [] }),
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider mode="dark">
    <SidebarProvider><Sidebar>Navigation</Sidebar><SidebarInset><chat.MessageList messages={[{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Bundled chat' }] }]} /><chat.ChatProvider adapter={adapter}><chat.Chat agent="local" /></chat.ChatProvider><Card><Input aria-label="Message" /><Button>Send</Button></Card><Select defaultValue="one"><SelectTrigger aria-label="Choice"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="one">One</SelectItem></SelectContent></Select></SidebarInset></SidebarProvider>
  </ThemeProvider>,
)
`,
  );

  fs.writeFileSync(
    path.join(appRoot, 'tsconfig.strict.json'),
    `${JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: { skipLibCheck: false },
        include: ['src/contract.tsx'],
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(appRoot, 'src/contract.tsx'),
    `import type { ChatManifest, TurnState } from '@frogbotai/protocol'
import { type ChatPlatformAdapter, ModelSelector } from '@frogbotai/ui/chat'
import * as icons from '@frogbotai/ui/icons'
import { ThemeProvider } from '@frogbotai/ui/theme'

const manifest: ChatManifest = {
  defaultAgent: 'local',
  agents: [{ slug: 'local', label: 'Local', source: 'config', defaultModel: 'ollama/llama3', models: ['ollama/llama3'], profile: { name: 'Local' } }],
  transcribe: false,
}

const idle: TurnState = 'idle'

export const adapter: ChatPlatformAdapter = {
  loadManifest: async () => manifest,
  createTransport: () => ({ sendMessages: async () => new ReadableStream(), reconnectToStream: async () => null }),
  listChats: async ({ page }) => ({ docs: [], page, totalDocs: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false }),
  getChat: async (id) => ({ id, agent: 'local', channelThread: { account: 'main', thread: {} } }),
  loadMessages: async () => ({ messages: [], queued: [] }),
  loadTurnState: async () => idle,
}

export const wrongTurnState: Pick<ChatPlatformAdapter, 'loadTurnState'> = {
  // @ts-expect-error 'busy' is not a TurnState
  loadTurnState: async () => 'busy',
}

export const iconCount = Object.keys(icons).length

export const picker = (
  <ThemeProvider mode="dark">
    <ModelSelector
      models={[{ id: 'ollama/llama3', name: 'Llama 3', provider: 'ollama', providerName: 'My Ollama' }]}
      selectedModelId="ollama/llama3"
      onModelChange={() => {}}
      onReasoningChange={() => {}}
    />
  </ThemeProvider>
)
`,
  );

  run('pnpm', ['install', '--ignore-scripts'], appRoot);

  const store = fs.readdirSync(path.join(appRoot, 'node_modules/.pnpm'));

  assert.deepEqual(
    store.filter((entry) => entry.startsWith('frogbot@')),
    [],
    'installing @frogbotai/ui pulled in frogbot',
  );

  run(
    'node',
    [
      '--input-type=module',
      '--eval',
      `const keys = Object.keys(await import('@frogbotai/protocol')); if (keys.length) throw new Error('@frogbotai/protocol exports values: ' + keys.join(', '))`,
    ],
    appRoot,
  );

  run(
    'node',
    ['node_modules/typescript-lib-check/bin/tsc', '--noEmit', '-p', 'tsconfig.strict.json'],
    appRoot,
  );

  for (const subpath of [
    './icons',
    './icons/registry',
    './theme',
    './chat',
    './chat/rest',
    './chat/tools',
    './chat/artifacts',
    './shared',
    './icons/menu',
  ]) {
    const specifier = subpath === '.' ? '@frogbotai/ui' : `@frogbotai/ui/${subpath.slice(2)}`;
    run('node', ['--input-type=module', '--eval', `await import('${specifier}')`], appRoot);
  }

  run('pnpm', ['build'], appRoot);

  const bundle = fs
    .readdirSync(path.join(appRoot, 'dist/assets'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(appRoot, 'dist/assets', file), 'utf8'))
    .join('\n');

  assert.match(bundle, /Navigation/);
  assert.match(bundle, /Bundled chat/);
  assert.match(bundle, /fb-chat__composer/);
  assert.ok(!bundle.includes('FrogBotSDKError'), './chat bundled @frogbotai/sdk');

  const bundledCss = fs
    .readdirSync(path.join(appRoot, 'dist/assets'))
    .filter((file) => file.endsWith('.css'))
    .map((file) => fs.readFileSync(path.join(appRoot, 'dist/assets', file), 'utf8'))
    .join('\n');

  assert.match(bundledCss, /^@layer theme,\s*base,\s*components,\s*frogbot,\s*utilities;/);

  for (const forbidden of [
    'process.env',
    '@payloadcms/',
    '@tauri-apps/',
    '@capacitor/',
    'electron',
    'expo-',
    'next/',
    'FrogBot Pro',
    'firmware.ai',
  ]) {
    assert.ok(!bundle.includes(forbidden));
  }

  fs.writeFileSync(
    path.join(appRoot, 'src/icon.ts'),
    `export { MenuIcon } from '@frogbotai/ui/icons/menu'\n`,
  );

  fs.writeFileSync(
    path.join(appRoot, 'vite.icon.config.js'),
    `import { defineConfig } from 'vite'
export default defineConfig({ build: { lib: { entry: 'src/icon.ts', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } })
`,
  );

  run('pnpm', ['vite', 'build', '--config', 'vite.icon.config.js'], appRoot);
  const iconBundle = fs
    .readdirSync(path.join(appRoot, 'dist'))
    .find((file) => file.endsWith('.js'));

  assert.ok(iconBundle);
  assert.ok(fs.statSync(path.join(appRoot, 'dist', iconBundle)).size < 4000);

  console.log(
    '[test-ui-package] Packed exports, types, protocol contract, install graph, CSS, client directive, Node ESM, and Vite consumption passed.',
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
