import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type InitOptions = {
  dir?: string;
  cwd?: string;
  log?: (message: string) => void;
};

function gatewayVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    if (pkg.version) return `^${pkg.version}`;
  } catch {
    return 'latest';
  }
  return 'latest';
}

function packageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'tsx watch src/server.ts',
        start: 'tsx src/server.ts',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        '@frogbotai/gateway': gatewayVersion(),
        '@hono/node-server': '^1.13.7',
      },
      devDependencies: {
        '@types/node': '^22.10.2',
        tsx: '^4.19.2',
        typescript: '^5.6.2',
      },
    },
    null,
    2,
  )}\n`;
}

const TSCONFIG = `${JSON.stringify(
  {
    $schema: 'https://json.schemastore.org/tsconfig',
    compilerOptions: {
      esModuleInterop: true,
      isolatedModules: true,
      lib: ['es2022'],
      module: 'ESNext',
      moduleDetection: 'force',
      moduleResolution: 'Bundler',
      noEmit: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: true,
      target: 'ES2022',
      types: ['node'],
    },
    include: ['src'],
    exclude: ['node_modules'],
  },
  null,
  2,
)}\n`;

const SERVER_TS = `import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createGateway } from '@frogbotai/gateway';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const providers = {
  ...(process.env.OPENAI_API_KEY ? { openai: { apiKey: process.env.OPENAI_API_KEY } } : {}),
  ...(process.env.ANTHROPIC_API_KEY ? { anthropic: { apiKey: process.env.ANTHROPIC_API_KEY } } : {}),
};

if (Object.keys(providers).length === 0) {
  console.error('no providers configured — set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

const gateway = createGateway({
  providers,
  hooks: {
    afterOperation: [
      ({ operation, model, usage }) => {
        console.log(\`[usage] \${operation} model=\${model} totalTokens=\${usage?.totalTokens ?? 0}\`);
      },
    ],
  },
});

const port = Number(process.env.PORT ?? 3939);

serve({ fetch: gateway.handler, port }, (info) => {
  console.log(\`gateway listening on http://localhost:\${info.port}/v1\`);
});
`;

const ENV_EXAMPLE = `OPENAI_API_KEY=
ANTHROPIC_API_KEY=

PORT=3939
`;

const GITIGNORE = `node_modules
.env
dist
`;

function readme(name: string): string {
  return `# ${name}

A standalone [\`@frogbotai/gateway\`](https://www.npmjs.com/package/@frogbotai/gateway) server.

## Run

\`\`\`bash
npm install
cp .env.example .env   # add your provider keys
npm run dev
\`\`\`

Then point any OpenAI-compatible client at \`http://localhost:3939/v1\` and use \`provider/model\` IDs:

\`\`\`bash
curl http://localhost:3939/v1/chat/completions \\
  -H 'Content-Type: application/json' \\
  -d '{ "model": "openai/gpt-4o-mini", "messages": [{ "role": "user", "content": "Hello" }] }'
\`\`\`

Edit \`src/server.ts\` to add providers (36+ built in, including Amazon Bedrock and Google Vertex), self-hosted OpenAI-compatible endpoints via \`openaiCompatible\` (vLLM, Ollama, ...), hooks, and observability. Docs: https://docs.frogbot.ai
`;
}

export function runInit(options: InitOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();
  const log = options.log ?? ((message: string) => console.log(message));
  const target = resolve(cwd, options.dir ?? '.');
  const name = basename(target);

  const files: Record<string, string> = {
    'package.json': packageJson(name),
    'tsconfig.json': TSCONFIG,
    'src/server.ts': SERVER_TS,
    '.env.example': ENV_EXAMPLE,
    '.gitignore': GITIGNORE,
    'README.md': readme(name),
  };

  const conflicts = Object.keys(files).filter((file) => existsSync(join(target, file)));
  if (conflicts.length > 0) {
    throw new Error(`refusing to overwrite existing files in ${target}: ${conflicts.join(', ')}`);
  }

  mkdirSync(join(target, 'src'), { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(target, file), contents);
  }

  const cdHint = target === resolve(cwd) ? '' : `  cd ${options.dir}\n`;
  log(
    [
      `created gateway server in ${target}`,
      '',
      'next steps:',
      `${cdHint}  npm install`,
      '  cp .env.example .env   # add your provider keys',
      '  npm run dev',
    ].join('\n'),
  );
}
