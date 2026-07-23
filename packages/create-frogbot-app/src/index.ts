import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export function scaffold({
  dest,
  projectName,
  templateDir,
}: {
  dest: string;
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

  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name: string };
  pkg.name = projectName;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  fs.writeFileSync(
    path.join(dest, 'pnpm-workspace.yaml'),
    'allowBuilds:\n  sharp: true\n  esbuild: true\n',
  );
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

  const templateDir = path.join(dirname, 'templates', 'blank');
  scaffold({ dest, projectName, templateDir });

  console.log(`
Created ${projectName}.

Next steps:
  cd ${projectName}
  pnpm install
  cp .env.example .env   # set OPENAI_API_KEY
  pnpm dev
`);
}
