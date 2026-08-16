import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

const COMMANDS: Record<PackageManager, { dev: string; install: string }> = {
  bun: { dev: 'bun dev', install: 'bun install' },
  npm: { dev: 'npm run dev', install: 'npm install' },
  pnpm: { dev: 'pnpm dev', install: 'pnpm install' },
  yarn: { dev: 'yarn dev', install: 'yarn install' },
};

export function detectPackageManager(
  userAgent = process.env.npm_config_user_agent,
): PackageManager {
  const name = userAgent?.split('/')[0];
  return name === 'bun' || name === 'pnpm' || name === 'yarn' ? name : 'npm';
}

export function scaffold({
  dest,
  packageManager = detectPackageManager(),
  projectName,
  templateDir,
}: {
  dest: string;
  packageManager?: PackageManager;
  projectName: string;
  templateDir: string;
}): void {
  if (fs.existsSync(dest)) {
    throw new Error(`Directory "${projectName}" already exists.`);
  }

  fs.cpSync(templateDir, dest, { recursive: true });

  const gitignore = path.join(dest, 'gitignore');
  if (fs.existsSync(gitignore)) {
    fs.renameSync(gitignore, path.join(dest, '.gitignore'));
  }

  const envExample = path.join(dest, '.env.example');
  if (fs.existsSync(envExample)) {
    const env = fs
      .readFileSync(envExample, 'utf8')
      .replace(/^FROGBOT_SECRET=.*$/m, `FROGBOT_SECRET=${randomBytes(24).toString('hex')}`);
    fs.writeFileSync(path.join(dest, '.env'), env);
  }

  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name: string };
  pkg.name = projectName;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  if (packageManager === 'pnpm') {
    fs.writeFileSync(
      path.join(dest, 'pnpm-workspace.yaml'),
      "allowBuilds:\n  sharp: true\n  esbuild: true\nminimumReleaseAgeExclude:\n  - frogbot\n  - '@frogbotai/*'\n",
    );
  }
}

export async function main(): Promise<void> {
  let projectName = process.argv[2]?.trim();

  if (!projectName) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    projectName = (await rl.question('Project name: ')).trim();
    rl.close();
  }

  if (!projectName || !/^[a-z0-9][a-z0-9._-]*$/.test(projectName)) {
    console.error('Provide a valid project name, e.g. `create-frogbot-app my-app`.');
    process.exit(1);
  }

  const dest = path.resolve(process.cwd(), projectName);
  if (fs.existsSync(dest)) {
    console.error(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  const packageManager = detectPackageManager();
  const templateDir = path.join(dirname, 'templates', 'blank');
  scaffold({ dest, packageManager, projectName, templateDir });

  const { dev, install } = COMMANDS[packageManager];
  console.log(`
Created ${projectName}.

Next steps:
  cd ${projectName}
  ${install}
  ${dev}
`);
}
