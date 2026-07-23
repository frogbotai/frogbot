import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const repoRoot = path.resolve(dirname, '..');
const binPath = path.resolve(repoRoot, 'packages/frogbot/bin.js');

const [targetSuite] = process.argv.slice(2);

function generateForSuite(suiteDir: string): Promise<number> {
  const configPath = ['config.ts', 'frogbot.config.ts']
    .map((name) => path.resolve(suiteDir, name))
    .find(fs.existsSync);
  if (!configPath) return Promise.resolve(1);
  const outputPath = path.resolve(suiteDir, 'frogbot-types.ts');

  console.log(`[generate:types] ${path.basename(suiteDir)}`);

  return new Promise((resolve) => {
    const child = spawn('node', [binPath, 'generate:types'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        FROGBOT_CONFIG_PATH: configPath,
        FROGBOT_TS_OUTPUT_PATH: outputPath,
      },
      stdio: 'inherit',
    });

    child.on('close', (code) => resolve(code ?? 0));
  });
}

async function run() {
  if (targetSuite) {
    const suiteDir = path.resolve(dirname, targetSuite);
    if (!fs.existsSync(path.resolve(suiteDir, 'config.ts'))) {
      console.error(`[generate:types] no config.ts found in ${suiteDir}`);
      process.exit(1);
    }
    const code = await generateForSuite(suiteDir);
    process.exit(code);
  }

  const testSuites = fs
    .readdirSync(dirname, { withFileTypes: true })
    .filter((f) => f.isDirectory() && !f.name.startsWith('_') && !f.name.startsWith('.'))
    .map((f) => path.resolve(dirname, f.name))
    .filter((dir) => fs.existsSync(path.resolve(dir, 'config.ts')));
  const suites = [
    ...testSuites,
    path.resolve(repoRoot, 'examples/simple'),
    path.resolve(repoRoot, 'templates/blank'),
  ];

  console.log(`[generate:types] found ${suites.length} suites\n`);

  let failures = 0;
  for (const suiteDir of suites) {
    const code = await generateForSuite(suiteDir);
    if (code !== 0) failures++;
  }

  console.log(`\n[generate:types] done. ${suites.length - failures}/${suites.length} succeeded.`);
  if (failures > 0) process.exit(1);
}

void run();
