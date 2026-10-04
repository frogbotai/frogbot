import { spawn } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

const typegenSpecs = {
  auth: 'test/unit/frogbot/auth/userTypegen.spec.ts',
  jobs: 'test/unit/frogbot/jobs/typegen.spec.ts',
};

const checks = [
  { area: 'source', project: 'tsconfig.json' },
  { area: 'typetest', project: 'tsconfig.typetest.json' },
  { area: 'skill', project: '../../test/types/skill/tsconfig.json' },
  { area: 'pieces', project: '../../test/types/pieces/tsconfig.json' },
  { area: 'jobs', project: '../../test/types/jobs/tsconfig.generated.json', after: 'typegen' },
  { area: 'jobs', project: '../../test/types/jobs/tsconfig.fallback.json' },
  { area: 'email', project: '../../test/types/email/tsconfig.json' },
  { area: 'fields', project: '../../test/types/fields/tsconfig.json' },
  { area: 'collections', project: '../../test/types/collections/tsconfig.json' },
  { area: 'live-preview', project: '../../test/types/live-preview/tsconfig.json' },
  { area: 'admin', project: '../../test/types/admin/tsconfig.json' },
  { area: 'ai', project: '../../test/types/ai/tsconfig.json' },
  { area: 'auth', project: '../../test/types/auth/tsconfig.generated.json', after: 'typegen' },
  { area: 'auth', project: '../../test/types/auth/tsconfig.fallback.json' },
  { area: 'auth', project: '../../test/types/auth/tsconfig.partial.json' },
  { area: 'search', project: '../../test/types/search/tsconfig.json' },
  { area: 'duplicate', project: '../../test/types/duplicate/tsconfig.json', after: 'copy' },
  {
    area: 'duplicate',
    project: '../../test/types/duplicate/tsconfig.generated.json',
    after: 'copy',
  },
];

const areas = [...new Set(checks.map(({ area }) => area))];
const requested = process.argv.slice(2);
const unknown = requested.filter((area) => !areas.includes(area));

if (unknown.length > 0) {
  console.error(`Unknown typecheck area: ${unknown.join(', ')}. Areas: ${areas.join(', ')}.`);
  process.exit(1);
}

const selected =
  requested.length > 0 ? checks.filter(({ area }) => requested.includes(area)) : checks;

const specs = [
  ...new Set(
    selected.filter(({ after }) => after === 'typegen').map(({ area }) => typegenSpecs[area]),
  ),
];

const exec = (command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { cwd: packageRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';

    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => resolve({ ok: false, output: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, output }));
  });

const copyDist = async () => {
  const copy = path.join(packageRoot, '.typetest-copy');

  await rm(copy, { recursive: true, force: true });
  await cp(path.join(packageRoot, 'dist'), path.join(copy, 'dist'), { recursive: true });

  return { ok: true, output: '' };
};

const label = ({ name, ok, note }) => `${ok ? '✓' : '✗'} ${name} (${note})`;

const report = (result) => {
  console.log(label(result));

  if (!result.ok && result.output.trim()) console.log(result.output.trim());
};

let free = availableParallelism();
const waiting = [];

const limit = async (work) => {
  if (free > 0) free -= 1;
  else await new Promise((resolve) => waiting.push(resolve));

  try {
    return await work();
  } finally {
    const next = waiting.shift();

    if (next) next();
    else free += 1;
  }
};

const run = async (name, work) => {
  const result = await limit(async () => {
    const started = performance.now();
    const outcome = await work().catch((error) => ({ ok: false, output: String(error) }));
    const seconds = (performance.now() - started) / 1000;

    return { name, ...outcome, note: `${seconds.toFixed(1)}s` };
  });

  report(result);

  return result;
};

const once = (work) => {
  let promise;

  return () => (promise ??= work());
};

const prerequisites = {
  typegen: once(() => run('typegen', () => exec('pnpm', ['-w', 'test:unit', ...specs]))),
  copy: once(() => run('copy dist to .typetest-copy', copyDist)),
};

const started = performance.now();

const results = await Promise.all(
  selected.map(async ({ area, project, after }) => {
    const name = `${area}: tsc --noEmit -p ${project}`;
    const prerequisite = after ? await prerequisites[after]() : { ok: true };

    if (!prerequisite.ok) {
      const skipped = { name, ok: false, output: '', note: `skipped, ${prerequisite.name} failed` };

      report(skipped);

      return skipped;
    }

    return run(name, () => exec(process.execPath, [tsc, '--noEmit', '-p', project]));
  }),
);

const failed = results.filter(({ ok }) => !ok);
const seconds = ((performance.now() - started) / 1000).toFixed(1);

if (failed.length > 0) {
  console.log(`\n${failed.length} of ${results.length} typechecks failed in ${seconds}s:`);
  console.log(failed.map(label).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`\n${results.length} typechecks passed in ${seconds}s`);
}
