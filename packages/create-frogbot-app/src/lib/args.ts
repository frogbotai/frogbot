import { parseArgs as parseNodeArgs } from 'node:util';

export interface CliArgs {
  agents?: string;
  ai?: string;
  database?: string;
  git: boolean;
  help: boolean;
  install: boolean;
  packageManager?: string;
  projectName?: string;
  template?: string;
  yes: boolean;
}

export const HELP = `Usage: create-frogbot-app [project-name] [options]

Options:
  -n, --name <name>           Project name
  -t, --template <template>   Template (default: blank)
  -d, --db <database>         sqlite, postgres, or mongodb
      --ai <provider>         zen, openai, anthropic, google, bedrock, or none
      --agents <targets>      Comma-separated claude, codex, cursor, opencode, copilot, gemini
      --no-agents             Do not install coding-agent skills
      --use-npm               Use npm
      --use-pnpm              Use pnpm
      --use-yarn              Use yarn
      --use-bun               Use bun
      --no-git                Do not initialize git
      --no-install            Do not install dependencies
      --no-deps               Alias for --no-install
  -y, --yes                   Accept defaults without prompts
  -h, --help                  Show help
`;

export function parseArgs(argv: string[]): CliArgs {
  const { positionals, values } = parseNodeArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      agents: { type: 'string' },
      ai: { type: 'string' },
      db: { type: 'string', short: 'd' },
      help: { type: 'boolean', short: 'h', default: false },
      name: { type: 'string', short: 'n' },
      'no-agents': { type: 'boolean', default: false },
      'no-deps': { type: 'boolean', default: false },
      'no-git': { type: 'boolean', default: false },
      'no-install': { type: 'boolean', default: false },
      template: { type: 'string', short: 't' },
      'use-bun': { type: 'boolean', default: false },
      'use-npm': { type: 'boolean', default: false },
      'use-pnpm': { type: 'boolean', default: false },
      'use-yarn': { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
    },
  });

  if (positionals.length > 1 || (values.name && positionals[0])) {
    throw new Error('Provide the project name once, either positionally or with --name.');
  }

  const managers = (['bun', 'npm', 'pnpm', 'yarn'] as const).filter(
    (name) => values[`use-${name}`],
  );

  if (managers.length > 1) throw new Error('Choose only one package manager.');

  return {
    agents: values['no-agents'] ? '' : values.agents,
    ai: values.ai,
    database: values.db,
    git: !values['no-git'],
    help: values.help,
    install: !values['no-install'] && !values['no-deps'],
    packageManager: managers[0],
    projectName: values.name ?? positionals[0],
    template: values.template,
    yes: values.yes,
  };
}
