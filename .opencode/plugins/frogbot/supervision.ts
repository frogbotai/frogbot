export const FREE_RESUMES = 1;

export const STALL_MS = 20 * 60_000;

export const STALL_CHECK_MS = 30_000;

export const SHELL_TIMEOUT_MS = 10 * 60_000;

export const LONG_SHELL_TIMEOUT_MS = 30 * 60_000;

export const READ_LIMIT = 400;

export const OUTPUT_MAX = 8_000;

export const OUTPUT_HEAD = 2_000;

export const OUTPUT_TAIL = 6_000;

export const MESSAGES = {
  push: '`git push` is not allowed here: ask the owner.',
  noVerify: '`git commit --no-verify` is not allowed here: fix the hook failure, then commit.',
  merge: '`git merge` is not allowed here: use `pnpm ticket land <n>`.',
  poll: '`sleep` and `kill -0` are not allowed here: run in the foreground with a timeout, or use a background shell and wait for its notification.',
  suite:
    'The full test suite is not allowed here: run the affected files or `--project`; the full suite runs in `pnpm ticket land`.',
  archive:
    "Subagents can't search `.idea/archive/`: name the file or folder you need, such as `.idea/found.md` or `.idea/tickets/<folder>`, or read `.idea/decisions.md`.",
  tag: 'The subagent description starts with a number but not a ticket key: start it with the key and a space or colon (`211A stage 4: …`, `250 lint: pnpm check`), or with no number for work outside a ticket.',
  stash:
    '`git stash` is not allowed while other worktrees exist: they share one stash list. Read the committed version with `git show HEAD:<file>`, or keep a temp copy of the file instead.',
  background:
    '`background: true` is not allowed in a subagent: run the call in the foreground with a timeout.',
} as const;

export type Denial = keyof typeof MESSAGES;

const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')', '`']);

const KEYWORDS = new Set([
  '!',
  '{',
  '}',
  'if',
  'then',
  'elif',
  'else',
  'while',
  'until',
  'do',
  'time',
  'exec',
  'command',
  'nohup',
  'env',
]);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const REDIRECT = /^(?:\d*|&)(?:>>?|<<?<?|>&|<&|>\|)(?:&?(?:\d+|-))?/;

export function simpleCommands(command: string): string[][] {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = '';
  let quoted = false;
  let quote: string | null = null;
  let target = false;
  let heredoc: { delimiter: string; strip: boolean } | null = null;

  const endWord = () => {
    if (word || quoted) {
      if (target) {
        if (heredoc && !heredoc.delimiter) heredoc.delimiter = word;
        target = false;
      } else {
        words.push(word);
      }
    }

    word = '';
    quoted = false;
  };

  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      quoted = true;
      continue;
    }

    if (char === '\\' && i + 1 < command.length) {
      if (command[i + 1] !== '\n') word += command[i + 1];
      i++;
      continue;
    }

    if (char === '#' && !word && !quoted) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i++;
      continue;
    }

    if (char === '$' && command[i + 1] === '(') {
      endCommand();
      i++;
      continue;
    }

    if ((char === '>' || char === '<') && (word === '' || /^\d+$/.test(word) || word === '&')) {
      const match = REDIRECT.exec(word + command.slice(i));
      const operator = match ? match[0] : char;
      i += operator.length - word.length - 1;
      word = '';
      quoted = false;

      if (/^\d*<<-?$/.test(operator)) {
        heredoc = { delimiter: '', strip: operator.endsWith('-') };
        target = true;
      } else if (!/&(?:\d+|-)$/.test(operator)) {
        target = true;
      }

      continue;
    }

    if (char === '>' || char === '<') {
      endWord();
      i--;
      continue;
    }

    if (SEPARATORS.has(char) || char === ' ' || char === '\t') {
      if (char === ' ' || char === '\t') endWord();
      else endCommand();

      if (char === '\n' && heredoc?.delimiter) {
        const end = skipHeredoc(command, i + 1, heredoc);
        heredoc = null;
        i = end - 1;
      }

      continue;
    }

    word += char;
  }

  endCommand();

  return commands.map(stripPrefix).filter((words) => words.length > 0);
}

function skipHeredoc(
  command: string,
  start: number,
  heredoc: { delimiter: string; strip: boolean },
) {
  let i = start;

  while (i < command.length) {
    const end = command.indexOf('\n', i);
    const line = command.slice(i, end === -1 ? command.length : end);
    const next = end === -1 ? command.length : end + 1;

    if ((heredoc.strip ? line.replace(/^\t+/, '') : line) === heredoc.delimiter) return next;
    i = next;
  }

  return command.length;
}

function stripPrefix(words: string[]) {
  let start = 0;

  while (start < words.length && (KEYWORDS.has(words[start]) || ASSIGNMENT.test(words[start]))) {
    start++;
  }

  return words.slice(start);
}

function commandName(word: string) {
  return word.slice(word.lastIndexOf('/') + 1);
}

const GIT_VALUE_OPTIONS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--config-env',
]);

const COMMIT_VALUE_OPTIONS = new Set([
  '--message',
  '--file',
  '--author',
  '--date',
  '--reuse-message',
  '--reedit-message',
  '--fixup',
  '--squash',
  '--template',
  '--cleanup',
  '--trailer',
  '--pathspec-from-file',
]);

const COMMIT_SHORT_VALUES = 'mFCct';

const COMMIT_SHORT_ATTACHED = 'Su';

const STASH_READS = new Set(['list', 'show']);

function gitSubcommand(args: string[]) {
  let i = 0;

  while (i < args.length && args[i].startsWith('-')) {
    i += GIT_VALUE_OPTIONS.has(args[i]) ? 2 : 1;
  }

  return { subcommand: args[i], rest: args.slice(i + 1) };
}

function changesStash(words: string[]) {
  if (commandName(words[0]) !== 'git') return false;

  const { subcommand, rest } = gitSubcommand(words.slice(1));

  return subcommand === 'stash' && !STASH_READS.has(rest[0]);
}

function gitDenial(args: string[]): Denial | undefined {
  const { subcommand, rest } = gitSubcommand(args);

  if (subcommand === 'push') return 'push';
  if (subcommand === 'merge') return 'merge';
  if (subcommand === 'commit' && skipsHooks(rest)) return 'noVerify';

  return undefined;
}

function skipsHooks(args: string[]) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--') return false;
    if (arg === '--no-verify') return true;

    if (arg.startsWith('--')) {
      if (COMMIT_VALUE_OPTIONS.has(arg)) i++;
      continue;
    }

    if (!arg.startsWith('-') || arg.length < 2) continue;

    for (let j = 1; j < arg.length; j++) {
      if (arg[j] === 'n') return true;

      if (COMMIT_SHORT_VALUES.includes(arg[j])) {
        if (j === arg.length - 1) i++;
        break;
      }

      if (COMMIT_SHORT_ATTACHED.includes(arg[j])) break;
    }
  }

  return false;
}

const SUITES = [
  ['pnpm', 'test'],
  ['pnpm', 'run', 'test'],
  ['vitest', 'run'],
  ['pnpm', 'vitest', 'run'],
  ['pnpm', 'exec', 'vitest', 'run'],
  ['npx', 'vitest', 'run'],
  ['playwright', 'test'],
  ['pnpm', 'exec', 'playwright', 'test'],
  ['npx', 'playwright', 'test'],
  ['pnpm', 'test:browser'],
  ['pnpm', 'run', 'test:browser'],
];

const SUITE_FILTERS = new Set([
  '--project',
  '-t',
  '--testNamePattern',
  '-g',
  '--grep',
  '--last-failed',
  '--changed',
  '--related',
  '--only-changed',
]);

const SUITE_VALUE_FLAGS = new Set([
  '--reporter',
  '--config',
  '-c',
  '--workers',
  '-j',
  '--retries',
  '--shard',
  '--timeout',
  '--max-failures',
  '--pool',
]);

function isBareSuite(words: string[]) {
  const name = [commandName(words[0]), ...words.slice(1)];
  const suite = SUITES.find((prefix) => prefix.every((word, i) => name[i] === word));

  if (!suite) return false;

  const args = words.slice(suite.length);

  for (let i = 0; i < args.length; i++) {
    const [flag] = args[i].split('=', 1);

    if (SUITE_FILTERS.has(flag)) return false;
    if (!args[i].startsWith('-')) return false;
    if (SUITE_VALUE_FLAGS.has(args[i])) i++;
  }

  return true;
}

export function denial(command: string, { worktrees = 1 } = {}): Denial | undefined {
  for (const words of simpleCommands(command)) {
    const name = commandName(words[0]);

    if (name === 'git') {
      const found = gitDenial(words.slice(1));
      if (found) return found;
    }

    if (worktrees > 1 && changesStash(words)) return 'stash';
    if (name === 'sleep' || (name === 'kill' && words[1] === '-0')) return 'poll';
    if (isBareSuite(words)) return 'suite';
  }

  return undefined;
}

export function stashes(command: string) {
  return simpleCommands(command).some(changesStash);
}

export function worktreeCount(porcelain: string) {
  return porcelain.split('\n').filter((line) => line.startsWith('worktree ')).length;
}

export function backgroundCall(tool: string, input: unknown) {
  if (tool !== 'shell' && tool !== 'subagent') return false;

  return (input as { background?: unknown } | null)?.background === true;
}

const ARCHIVE = /(?:^|\/)\.idea\/archive(?:\/|$)/;

const IDEA_WILDCARD = /(?:^|\/)\.idea\/[*?[{]/;

const SEARCHERS = new Set(['rg', 'ag', 'ack', 'fd', 'find', 'tree']);

const GREPS = new Set(['grep', 'egrep', 'fgrep']);

const PATTERN_FIRST = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'fd']);

const PATTERN_FLAGS = new Set(['-e', '--regexp', '-f', '--file', '--files']);

const VALUE_FLAGS = new Set([
  '-A',
  '-B',
  '-C',
  '-m',
  '-d',
  '-D',
  '-g',
  '-t',
  '-T',
  '--include',
  '--exclude',
  '--glob',
  '--type',
  '--max-count',
]);

function normalizePath(value: string) {
  return value.replaceAll('\\', '/').replace(/\/+$/, '');
}

function scopesArchive(path: string) {
  const normalized = normalizePath(path);

  return normalized === '.idea' || normalized.endsWith('/.idea') || ARCHIVE.test(normalized);
}

function recursive(name: string, args: string[]) {
  if (SEARCHERS.has(name)) return true;

  const flags = args.filter((arg) => arg.startsWith('-'));

  if (GREPS.has(name)) {
    return flags.some(
      (flag) =>
        /^-[a-zA-Z]*[rR]/.test(flag) ||
        /^--(?:dereference-)?recursive$/.test(flag) ||
        flag === '--directories=recurse',
    );
  }

  return name === 'ls' && flags.some((flag) => /^-[a-zA-Z]*R/.test(flag) || flag === '--recursive');
}

function pathArgs(name: string, args: string[]) {
  const positional: string[] = [];
  let patternGiven = !PATTERN_FIRST.has(name);

  for (let i = 0; i < args.length; i++) {
    const [flag] = args[i].split('=', 1);

    if (name === 'find' && /^[-(!]/.test(args[i])) break;

    if (PATTERN_FLAGS.has(flag) || /^-[a-zA-Z]*[ef]$/.test(args[i])) patternGiven = true;

    if (args[i].startsWith('-')) {
      if ((VALUE_FLAGS.has(args[i]) || PATTERN_FLAGS.has(args[i])) && args[i] !== '--files') i++;
      continue;
    }

    positional.push(args[i]);
  }

  return patternGiven ? positional : positional.slice(1);
}

function shellSearchesArchive(command: string, workdir: string) {
  if (ARCHIVE.test(normalizePath(workdir))) return true;

  let inIdea = workdir !== '' && scopesArchive(workdir);

  for (const words of simpleCommands(command.replaceAll('\\', '/'))) {
    const name = commandName(words[0]);
    const args = words.slice(1);

    if (name === 'cd' || name === 'pushd') {
      const target = args.find((arg) => !arg.startsWith('-')) ?? '';

      if (ARCHIVE.test(normalizePath(target))) return true;
      inIdea = scopesArchive(target);
      continue;
    }

    const paths = pathArgs(name, args);

    if (paths.some(patternTouchesArchive)) return true;
    if (!recursive(name, args)) continue;

    const scoped = (path: string) => scopesArchive(path) || (inIdea && /^\.?\/?\*?$/.test(path));

    if (paths.some(scoped) || (inIdea && paths.length === 0)) return true;
  }

  return false;
}

function patternTouchesArchive(pattern: string) {
  const normalized = normalizePath(pattern);

  return normalized.includes('.idea/archive') || IDEA_WILDCARD.test(normalized);
}

export function searchesArchive(tool: string, input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;

  const fields = input as Record<string, unknown>;
  const text = (key: string) => (typeof fields[key] === 'string' ? fields[key] : '');

  if (tool === 'grep') {
    return (
      (text('path') !== '' && scopesArchive(text('path'))) || patternTouchesArchive(text('include'))
    );
  }

  if (tool === 'glob') {
    return (
      (text('path') !== '' && scopesArchive(text('path'))) || patternTouchesArchive(text('pattern'))
    );
  }

  if (tool === 'shell') return shellSearchesArchive(text('command'), text('workdir'));

  return false;
}

export function isTicketLand(command: string) {
  return simpleCommands(command).some((words) => {
    const name = [commandName(words[0]), ...words.slice(1)];
    const args = name[0] === 'node' ? name.slice(1) : name;

    return (
      (args[0] === 'pnpm' && args[1] === 'ticket' && args[2] === 'land') ||
      (args[0] === 'pnpm' && args[1] === 'run' && args[2] === 'ticket' && args[3] === 'land') ||
      (args[0]?.endsWith('ticket.mjs') && args[1] === 'land')
    );
  });
}

export function shellTimeout(input: { command: string; timeout: number; background: boolean }) {
  if (isTicketLand(input.command)) return LONG_SHELL_TIMEOUT_MS;
  if (input.timeout === 0) return LONG_SHELL_TIMEOUT_MS;

  return Math.min(input.timeout, input.background ? LONG_SHELL_TIMEOUT_MS : SHELL_TIMEOUT_MS);
}

export function readInput(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  if ((input as Record<string, unknown>).limit !== undefined) return input;

  return { ...input, limit: READ_LIMIT };
}

export function capOutput(text: string, file?: string) {
  if (text.length <= OUTPUT_MAX) return text;

  const removed = (text.length - OUTPUT_HEAD - OUTPUT_TAIL).toLocaleString('en-US');
  const where = file ? `; full output: ${file}` : '';

  return `${text.slice(0, OUTPUT_HEAD)}\n[${removed} characters removed${where}]\n${text.slice(-OUTPUT_TAIL)}`;
}

export type TokenUsage = {
  input: number;
  cache: { read: number; write: number };
};

export function contextTokens(messages: readonly { type: string; tokens?: TokenUsage }[]) {
  const last = messages.findLast((message) => message.type === 'assistant' && message.tokens);

  if (!last?.tokens) return 0;

  return last.tokens.input + last.tokens.cache.read + last.tokens.cache.write;
}

function formatTokens(tokens: number) {
  return tokens >= 1_000 ? `${Math.round(tokens / 1_000)}k` : String(tokens);
}

export function resumeDecision(input: {
  resumes: number;
  title: string;
  tokens: number;
  cost: number;
}): { effect: 'ask'; message: string } | undefined {
  const resume = input.resumes + 1;

  if (resume <= FREE_RESUMES) return undefined;

  return {
    effect: 'ask',
    message: `Resume #${resume} of "${input.title}": ${formatTokens(input.tokens)} tokens in context, $${input.cost.toFixed(2)} so far.`,
  };
}

export type SubagentAfter =
  { status: 'completed' } | { status: 'error'; error: { message: string } };

export function resumed(event: SubagentAfter) {
  return event.status === 'completed' || /\(sessionID: [^)]+\)/.test(event.error.message);
}

export type ResumeStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: number): Promise<void>;
};

export type ChildSession = (sessionID: string) => Promise<{
  title: string;
  tokens: number;
  cost: number;
}>;

export function createResumeCap(store: ResumeStore, child: ChildSession) {
  const calls = new Map<string, string>();
  const key = (sessionID: string) => `resumes/${sessionID}`;
  const count = async (sessionID: string) => Number((await store.get(key(sessionID))) ?? 0);

  return {
    record(callID: string, input: unknown) {
      const target =
        typeof input === 'object' && input !== null
          ? (input as { sessionID?: unknown }).sessionID
          : undefined;

      if (typeof target === 'string' && target !== '') calls.set(callID, target);
    },

    async evaluate(callID: string) {
      const target = calls.get(callID);
      if (!target) return undefined;

      const [resumes, info] = await Promise.all([count(target), child(target)]);

      return resumeDecision({ resumes, ...info });
    },

    async settle(callID: string, outcome: SubagentAfter) {
      const target = calls.get(callID);
      calls.delete(callID);

      if (target && resumed(outcome)) await store.set(key(target), (await count(target)) + 1);
    },
  };
}

export type StallNotice = { parentID: string; text: string };

type Watched = {
  parentID: string;
  title: string;
  running: boolean;
  last: number;
  activity: string;
  notified: boolean;
};

function clock(time: number) {
  const date = new Date(time);

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function createWatchdog(stallMs = STALL_MS) {
  const sessions = new Map<string, Watched>();

  return {
    has: (sessionID: string) => sessions.has(sessionID),

    track(sessionID: string, parentID: string, title: string) {
      if (sessions.has(sessionID)) return;

      sessions.set(sessionID, {
        parentID,
        title,
        running: false,
        last: 0,
        activity: 'start',
        notified: false,
      });
    },

    start(sessionID: string, now: number) {
      const session = sessions.get(sessionID);
      if (!session) return;

      Object.assign(session, { running: true, last: now, activity: 'start', notified: false });
    },

    stop(sessionID: string) {
      const session = sessions.get(sessionID);
      if (session) session.running = false;
    },

    forget(sessionID: string) {
      sessions.delete(sessionID);
    },

    activity(sessionID: string, activity: string, now: number) {
      const session = sessions.get(sessionID);
      if (!session) return;

      Object.assign(session, { last: now, activity, notified: false });
    },

    due(now: number): StallNotice[] {
      const notices: StallNotice[] = [];

      for (const [sessionID, session] of sessions) {
        if (!session.running || session.notified || now - session.last < stallMs) continue;

        session.notified = true;
        notices.push({
          parentID: session.parentID,
          text: `Subagent "${session.title}" (${sessionID}) has made no progress for ${Math.round(stallMs / 60_000)} min; last activity: ${session.activity} at ${clock(session.last)}.`,
        });
      }

      return notices;
    },
  };
}

const TICKET_TAG = /^\d+[a-z]?(?=[\s:]|$)/i;

export function badTicketTag(input: unknown) {
  const description =
    typeof input === 'object' && input !== null
      ? (input as { description?: unknown }).description
      : undefined;

  if (typeof description !== 'string') return false;

  const text = description.trim();

  return /^\d/.test(text) && !TICKET_TAG.test(text);
}

export const ALERT_QUIET_MS = 10 * 60_000;

export type Alert = { title: string; message: string };

export function failureAlert(input: {
  title: string;
  root: boolean;
  error?: { type?: string; message?: string };
}): Alert | undefined {
  const type = input.error?.type ?? 'unknown';
  const reason = (input.error?.message ?? '').split('\n')[0].slice(0, 200);

  if (type === 'provider.auth') {
    return {
      title: 'FrogBot: provider sign-in failed',
      message: `"${input.title}" stopped: ${reason}. Sign in again (for Bedrock, aws sso login), then tell it to continue.`,
    };
  }

  if (!input.root) return undefined;

  return {
    title: 'FrogBot: turn failed',
    message: `"${input.title}" stopped (${type}): ${reason}`,
  };
}

export function createAlerts(quietMs = ALERT_QUIET_MS) {
  const sent = new Map<string, number>();

  return (alert: Alert, now: number) => {
    const last = sent.get(alert.title);

    if (last !== undefined && now - last < quietMs) return false;

    sent.set(alert.title, now);

    return true;
  };
}

export function notification(alert: Alert): [string, string[]] {
  return [
    'osascript',
    [
      '-e',
      'on run argv',
      '-e',
      'display notification (item 2 of argv) with title (item 1 of argv)',
      '-e',
      'end run',
      alert.title,
      alert.message,
    ],
  ];
}
