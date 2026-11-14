import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type {
  Noun,
  RawVerb,
  Verb,
} from '../../../../packages/plugins/plugin-dojo/src/cli/command.js';
import { dojoCommands } from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';

type Commands = Record<string, Verb | RawVerb | Noun>;

const skillFiles = ['skills/frogbot/SKILL.md', 'skills/frogbot/reference/DOJO.md'];

const invocation = /(?:frogbot dojo|npx @frogbotai\/plugin-dojo)((?: [a-z][a-z-]*){1,2})/g;

function read(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${file}`, import.meta.url)), 'utf8');
}

function named(markdown: string): string[] {
  return [...markdown.matchAll(invocation)].map(([, words = '']) => words.trim());
}

function unknown(commands: Commands, words: string): string | undefined {
  const [name = '', verb] = words.split(' ');
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;

  if (!command) return `"${name}" isn't a Dojo command`;
  if (!('verbs' in command)) return undefined;
  if (!verb) return `"${name}" needs a verb`;
  if (!Object.hasOwn(command.verbs, verb)) return `"${verb}" isn't a verb of ${name}`;

  return undefined;
}

function problems(commands: Commands, markdown: string): string[] {
  return named(markdown).flatMap((words) => {
    const problem = unknown(commands, words);

    return problem ? [`${words}: ${problem}`] : [];
  });
}

describe('the FrogBot skill names only real Dojo commands', () => {
  it.each(skillFiles)('%s', (file) => {
    expect(problems(dojoCommands, read(file))).toEqual([]);
  });

  it('teaches every Dojo command', () => {
    const taught = new Set(skillFiles.flatMap((file) => named(read(file))));

    const missing = Object.entries(dojoCommands).flatMap(([name, command]) =>
      'verbs' in command
        ? Object.keys(command.verbs)
            .map((verb) => `${name} ${verb}`)
            .filter((words) => !taught.has(words))
        : taught.has(name)
          ? []
          : [name],
    );

    expect(missing).toEqual([]);
  });

  it('fails when the CLI renames a command the skill names', () => {
    const { summary, verbs } = dojoCommands.domains as Noun;
    const { set, ...rest } = verbs;
    const renamed: Commands = {
      ...dojoCommands,
      domains: { summary, verbs: { ...rest, add: set } },
    };

    expect(problems(renamed, read('skills/frogbot/reference/DOJO.md'))).toContain(
      `domains set: "set" isn't a verb of domains`,
    );
  });

  it('fails on a command or verb that never existed', () => {
    expect(
      problems(
        dojoCommands,
        'Run `npx frogbot dojo apps deploy acme` or `frogbot dojo secrets list`.',
      ),
    ).toEqual([
      'apps deploy: "deploy" isn\'t a verb of apps',
      'secrets list: "secrets" isn\'t a Dojo command',
    ]);
  });
});
