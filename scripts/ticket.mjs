#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkCommitMessage, TYPES } from './commit-msg.mjs';
import { affectedRuns } from './lib/affected.mjs';

export const FULL_TIER = [
  '**/migrations/**',
  'packages/*/src/collections/config/**',
  'packages/*/src/jobs/**',
  'packages/*/src/uploads/**',
  '**/access.ts',
  '**/access/**',
  '**/*Access.ts',
  'packages/storage-*/**',
  'packages/*/src/exports/**',
];

export const BASE_GATES = ['check --full', 'test:unit', 'test:ui'];

export const LAND = 'land';

export const LEDGER_COLUMNS = ['ticket', 'patch-id', 'level', 'evidence', 'verifier', 'ts'];

const PASS_LEVELS = ['typecheck', 'unit', 'int', 'ui'];

const TESTER_CHECK = false;

const TAIL_LINES = 20;

const MAIN = 'main';

const DEFAULT_TYPE = 'feat';

const USAGE =
  'usage: pnpm ticket new <n> [--type <type>] | land <n> [-m "<message>"] | status [--batch <n>] | next';

const ENV = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };

const HEADER = /(?:^|\s·\s)Batch:/;

const DEPENDS = /^\d+(?:\s*,\s*\d+)*$/;

const BATCH = /^(?:\d+|none|deferred)$/;

const FOLDER = /^ticket(\d+)_(.+)$/;

const BRANCH_TICKET = /(?:^|\/)ticket-?(\d+)(?=-|$)/;

const WORKTREE_TICKET = /frogbot-ticket(\d+)$/;

const REFLOG_MERGE = /^([0-9a-f]+) merge (\S+):/;

function number(text) {
  return /^\d+$/.test(text ?? '') ? Number(text) : null;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv[0] === '--' ? argv.slice(1) : argv;
  const options = { command };
  const positional = [];

  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    const flag = { '--type': 'type', '-m': 'message', '--batch': 'batch' }[arg];

    if (!flag) {
      if (arg.startsWith('-')) return { error: `unknown argument "${arg}"` };

      positional.push(arg);
      continue;
    }

    const value = rest[++index];

    if (value === undefined) return { error: `${arg} needs a value` };

    options[flag] = value;
  }

  const allowed = {
    new: { ticket: true, flags: ['type'] },
    land: { ticket: true, flags: ['message'] },
    status: { ticket: false, flags: ['batch'] },
    next: { ticket: false, flags: [] },
  }[command];

  if (!allowed) return { error: command ? `unknown command "${command}"` : 'no command' };

  const extra = Object.keys(options).find(
    (key) => key !== 'command' && !allowed.flags.includes(key),
  );

  if (extra) return { error: `${command} takes no --${extra}` };

  if (positional.length !== (allowed.ticket ? 1 : 0)) {
    return {
      error: allowed.ticket
        ? `${command} needs one ticket number`
        : `${command} takes no arguments`,
    };
  }

  if (allowed.ticket) {
    options.ticket = number(positional[0]);

    if (options.ticket === null) return { error: `"${positional[0]}" is not a ticket number` };
  }

  if (command === 'new') {
    options.type ??= DEFAULT_TYPE;

    if (!TYPES.includes(options.type)) {
      return { error: `--type "${options.type}" is not one of ${TYPES.join(', ')}` };
    }
  }

  if (options.batch !== undefined) {
    if (!BATCH.test(options.batch)) return { error: `--batch "${options.batch}" is not a batch` };

    options.batch = number(options.batch) ?? options.batch;
  }

  return options;
}

export function parseHeader(text) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => HEADER.test(line));

  if (index === -1) return null;

  const fields = new Map(
    lines[index].split(' · ').map((part) => {
      const colon = part.indexOf(':');

      return colon === -1
        ? [part.trim(), '']
        : [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
    }),
  );

  const depends = fields.get('Depends on');
  const batch = fields.get('Batch');
  const problems = [];

  if (depends === undefined) problems.push('missing "Depends on:"');
  else if (depends !== 'none' && !DEPENDS.test(depends)) {
    problems.push(`Depends on: "${depends}" is not none or ticket numbers like 215, 216`);
  }

  if (!BATCH.test(batch)) problems.push(`Batch: "${batch}" is not a number, none or deferred`);

  return {
    line: index + 1,
    depends: depends && DEPENDS.test(depends) ? depends.split(',').map(Number) : [],
    batch: number(batch) ?? batch,
    problems,
  };
}

function statusLine(text) {
  return /^Status:\s*(.*)$/m.exec(text ?? '')?.[1].trim() ?? '';
}

export function stageOf({ research, spec, plan, implement, landed }) {
  if (landed) return 'landed';

  if (implement) return 'implement';

  if (plan != null) return /^Go \(.+\)$/.test(statusLine(plan)) ? 'go' : 'plan draft';

  if (spec != null) {
    return /^Approved \(.+\)$/.test(statusLine(spec)) ? 'spec approved' : 'spec draft';
  }

  return research ? 'research' : 'issue';
}

function splitOutside(text, separators) {
  const parts = [''];
  let depth = 0;

  for (const char of text) {
    if (char === '{') depth++;
    if (char === '}') depth--;

    if (depth === 0 && separators.includes(char)) parts.push('');
    else parts[parts.length - 1] += char;
  }

  return parts;
}

export function expandBraces(glob) {
  const match = /\{([^{}]*)\}/.exec(glob);

  if (!match) return [glob];

  const before = glob.slice(0, match.index);
  const after = glob.slice(match.index + match[0].length);

  return match[1].split(',').flatMap((option) => expandBraces(`${before}${option}${after}`));
}

function itemPaths(item) {
  const bare = item.replace(/\s*\([^()]*\)/g, '');
  const quoted = [...bare.matchAll(/`([^`]+)`/g)].map(([, text]) => text);
  const raw = quoted.length > 0 ? quoted : splitOutside(bare, ',;');

  return raw
    .map((text) => text.trim())
    .filter((text) => text && !/\s/.test(text))
    .flatMap(expandBraces);
}

export function parseTouches(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^touches:/.test(line));

  if (start === -1) return [];

  const inline = lines[start].slice('touches:'.length).trim();

  if (inline) return splitOutside(inline.replace(/^\[|\]$/g, ''), ',').flatMap(itemPaths);

  const items = [];

  for (const line of lines.slice(start + 1)) {
    const item = /^\s*[-*]\s+(.*)$/.exec(line);

    if (item) items.push(item[1]);
    else if (items.length > 0 && /^\s{2,}\S/.test(line)) {
      items[items.length - 1] += ` ${line.trim()}`;
    } else if (line.trim() !== '') break;
  }

  return items.flatMap(itemPaths);
}

export function globToRegExp(glob) {
  let source = '';

  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];

    if (char === '*' && glob[index + 1] === '*') {
      index++;

      if (glob[index + 1] === '/') {
        index++;
        source += '(?:.*/)?';
      } else source += '.*';
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(`^${source}$`);
}

export function matchesGlob(file, glob) {
  return globToRegExp(glob.endsWith('/') ? `${glob}**` : glob).test(file);
}

export function tierOf(touches) {
  if (touches == null) return '—';

  return touches.some((file) => FULL_TIER.some((glob) => matchesGlob(file, glob)))
    ? 'full'
    : 'light';
}

export function overlaps(a, b) {
  return a === b || matchesGlob(a, b) || matchesGlob(b, a);
}

export function lanes(tickets) {
  const parent = new Map(tickets.map(({ number: n }) => [n, n]));

  const root = (n) => (parent.get(n) === n ? n : root(parent.get(n)));

  const join = (a, b) => {
    const [low, high] = [root(a), root(b)].sort((x, y) => x - y);

    parent.set(high, low);
  };

  for (const [index, ticket] of tickets.entries()) {
    for (const dependency of ticket.depends) {
      if (parent.has(dependency)) join(ticket.number, dependency);
    }

    for (const other of tickets.slice(index + 1)) {
      const shared = ticket.touches.some((a) => other.touches.some((b) => overlaps(a, b)));

      if (shared) join(ticket.number, other.number);
    }
  }

  const roots = [...new Set(tickets.map(({ number: n }) => root(n)))].sort((a, b) => a - b);
  const name = (index) => (index < 26 ? String.fromCharCode(65 + index) : String(index + 1));

  return new Map(tickets.map(({ number: n }) => [n, name(roots.indexOf(root(n)))]));
}

export function slugOf(folder) {
  return FOLDER.exec(folder)[2].replaceAll('_', '-');
}

export function branchName({ type, ticket, slug }) {
  return `${type}/ticket-${ticket}-${slug}`;
}

export function worktreePath(main, ticket) {
  return path.join(path.dirname(main), `frogbot-ticket${ticket}`);
}

export function ticketOfBranch(branch) {
  return number(BRANCH_TICKET.exec(branch ?? '')?.[1]);
}

export function ticketOfWorktree({ path: dir, branch }) {
  return number(WORKTREE_TICKET.exec(dir)?.[1]) ?? ticketOfBranch(branch);
}

export function nextNumber({ folders, branches, worktrees }) {
  const numbers = [
    ...folders.map((folder) => number(FOLDER.exec(folder)?.[1])),
    ...branches.map(ticketOfBranch),
    ...worktrees.map(ticketOfWorktree),
  ].filter((n) => n !== null);

  return Math.max(0, ...numbers) + 1;
}

export function parseWorktrees(porcelain) {
  return porcelain
    .split(/\n\n+/)
    .filter((block) => block.startsWith('worktree '))
    .map((block) => {
      const fields = Object.fromEntries(
        block.split('\n').map((line) => {
          const space = line.indexOf(' ');

          return space === -1 ? [line, ''] : [line.slice(0, space), line.slice(space + 1)];
        }),
      );

      return {
        path: fields.worktree,
        branch: fields.branch?.replace(/^refs\/heads\//, '') ?? null,
      };
    });
}

export function parseReflogMerges(text) {
  return text.split('\n').flatMap((line) => {
    const match = REFLOG_MERGE.exec(line);

    return match ? [{ sha: match[1], branch: match[2] }] : [];
  });
}

export function ticketGit(ticket, { branches, merged, worktrees, landed }) {
  const own = branches.filter((branch) => ticketOfBranch(branch) === ticket);
  const worktree = worktrees.find((tree) => ticketOfWorktree(tree) === ticket) ?? null;
  const branch = own.includes(worktree?.branch) ? worktree.branch : (own[0] ?? null);
  const isMerged = branch ? merged.includes(branch) : null;
  const wasLanded = landed.some((name) => ticketOfBranch(name) === ticket);

  return {
    branch,
    worktree: worktree?.path ?? null,
    merged: isMerged,
    landed: wasLanded && (branch === null || isMerged),
  };
}

export function statusRow({ ticket, header, research, spec, plan, git, counts, lane }) {
  const touches = plan == null ? null : parseTouches(plan);
  const implement = Boolean(git.branch || git.worktree);

  return {
    ticket: String(ticket),
    stage: stageOf({ research, spec, plan, implement, landed: git.landed }),
    tier: tierOf(touches),
    depends: header.depends.length > 0 ? header.depends.join(', ') : 'none',
    lane,
    branch: git.branch ?? '—',
    worktree: git.worktree ? 'yes' : 'no',
    'ahead/behind': counts ? `+${counts.ahead} -${counts.behind}` : '—',
    merged: git.merged === null ? '—' : git.merged ? 'yes' : 'no',
  };
}

export function formatTable(rows) {
  if (rows.length === 0) return [];

  const columns = Object.keys(rows[0]);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => row[column].length)),
  );

  const line = (cells) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index]))
      .join('  ')
      .trimEnd();

  return [line(columns), ...rows.map((row) => line(columns.map((column) => row[column])))];
}

export function parseLedger(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith(`${LEDGER_COLUMNS[0]}\t`))
    .map((line) => {
      const [ticket, patchId, level, evidence, verifier, ts] = line.split('\t');

      return { ticket, patchId, level, evidence, verifier, ts };
    });
}

export function ledgerLine({ ticket, patchId, level, evidence, verifier, ts }) {
  return [ticket, patchId, level, evidence, verifier, ts]
    .map((field) => String(field).replace(/[\t\n]+/g, ' '))
    .join('\t');
}

export function hasTesterRow(rows, { ticket, patchId, worker }) {
  return rows.some(
    (row) =>
      row.ticket === String(ticket) &&
      row.patchId === patchId &&
      PASS_LEVELS.includes(row.level) &&
      row.verifier !== worker &&
      row.verifier !== LAND,
  );
}

export function landLevel(gates) {
  return gates.includes('test:int:sqlite') ? 'int' : 'unit';
}

export function tail(output, count = TAIL_LINES) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

class Refusal extends Error {}

function refuse(message) {
  throw new Refusal(message);
}

function git(cwd, args, input) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: ENV,
    input,
    maxBuffer: 256 * 1024 * 1024,
  });

  return {
    ok: result.status === 0,
    out: (result.stdout ?? '').trim(),
    err: `${result.stderr ?? ''}${result.error?.message ?? ''}`.trim(),
  };
}

function gitOut(cwd, args) {
  const result = git(cwd, args);

  if (!result.ok) refuse(`git ${args.join(' ')} failed: ${result.err.split('\n')[0]}`);

  return result.out;
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function mainCheckout() {
  return path.dirname(
    gitOut(process.cwd(), ['rev-parse', '--path-format=absolute', '--git-common-dir']),
  );
}

function ticketsDir(main) {
  return path.join(main, '.idea', 'tickets');
}

function folders(main) {
  const dir = ticketsDir(main);

  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && FOLDER.test(entry.name))
    .map((entry) => entry.name);
}

function readOptional(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function readTicket(main, folder) {
  const dir = path.join(ticketsDir(main), folder);
  const issue = readOptional(path.join(dir, 'issue.md'));
  const header = issue === null ? null : parseHeader(issue);

  return {
    ticket: Number(FOLDER.exec(folder)[1]),
    folder,
    issue: path.relative(main, path.join(dir, 'issue.md')),
    header,
    research: existsSync(path.join(dir, 'step1_research.md')),
    spec: readOptional(path.join(dir, 'step2_spec.md')),
    plan: readOptional(path.join(dir, 'step3_plan.md')),
  };
}

function headerProblems(tickets) {
  return tickets.flatMap(({ issue, header }) =>
    header.problems.map((problem) => `${issue}:${header.line} ${problem}`),
  );
}

function findTicket(main, ticket) {
  const matches = folders(main).filter((folder) => FOLDER.exec(folder)[1] === String(ticket));

  if (matches.length === 0) refuse(`no folder .idea/tickets/ticket${ticket}_<slug>/`);

  if (matches.length > 1) {
    refuse(`ticket ${ticket} has ${matches.length} folders: ${matches.join(', ')}`);
  }

  const found = readTicket(main, matches[0]);
  const problems = found.header ? headerProblems([found]) : [];

  if (problems.length > 0) refuse(problems.join('\n'));

  return found;
}

function branches(main) {
  return lines(gitOut(main, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']));
}

function worktrees(main) {
  return parseWorktrees(gitOut(main, ['worktree', 'list', '--porcelain']));
}

function landedBranches(main) {
  const reflog = git(main, ['reflog', 'show', '--format=%H %gs', MAIN]);

  if (!reflog.ok) return [];

  const seen = new Set();

  return parseReflogMerges(reflog.out).flatMap(({ sha, branch }) => {
    if (seen.has(branch)) return [];

    seen.add(branch);

    return git(main, ['merge-base', '--is-ancestor', sha, MAIN]).ok ? [branch] : [];
  });
}

function duration(ms) {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function openLog(main, name) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  const file = path.join(main, '.idea', 'tmp', `ticket-${name}-${stamp}.log`);

  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `pnpm ticket ${process.argv.slice(2).join(' ')}\n`);

  return file;
}

function step(log, label, command, args, cwd) {
  const started = performance.now();

  process.stdout.write(`${label} … `);
  appendFileSync(log, `\n$ ${[command, ...args].join(' ')}  (${cwd})\n`);

  const start = statSync(log).size;
  const fd = openSync(log, 'a');
  const result = spawnSync(command, args, { cwd, env: ENV, stdio: ['ignore', fd, fd] });

  closeSync(fd);

  const output = readFileSync(log).subarray(start).toString('utf8');
  const code = result.status ?? 1;
  const took = duration(performance.now() - started);

  appendFileSync(log, `→ exit ${code} · ${took}\n`);
  console.log(`${code === 0 ? 'ok' : 'failed'} · ${took}`);

  return { ok: code === 0, output };
}

function patchId(cwd) {
  const diff = git(cwd, ['diff', '--no-color', '--no-ext-diff', `${MAIN}...HEAD`]);

  return (
    git(cwd, ['patch-id', '--stable'], diff.out ? `${diff.out}\n` : '').out.split(' ')[0] || null
  );
}

function appendLedger(main, row) {
  const file = path.join(main, '.idea', 'ledger.tsv');

  mkdirSync(path.dirname(file), { recursive: true });

  if (!existsSync(file)) appendFileSync(file, `${LEDGER_COLUMNS.join('\t')}\n`);

  appendFileSync(file, `${ledgerLine({ ...row, ts: new Date().toISOString() })}\n`);
}

function readLedger(main) {
  return parseLedger(readOptional(path.join(main, '.idea', 'ledger.tsv')) ?? '');
}

function commandNext(main) {
  console.log(
    nextNumber({ folders: folders(main), branches: branches(main), worktrees: worktrees(main) }),
  );
}

function commandStatus(main, options) {
  const tickets = folders(main)
    .map((folder) => readTicket(main, folder))
    .filter(({ header }) => header);

  const problems = headerProblems(tickets);

  if (problems.length > 0) refuse(problems.join('\n'));

  const numbered = tickets
    .map(({ header }) => header.batch)
    .filter((value) => typeof value === 'number');

  if (options.batch === undefined && numbered.length === 0) {
    refuse('no ticket has a numbered Batch:');
  }

  const batch = options.batch ?? Math.max(...numbered);

  const selected = tickets
    .filter(({ header }) => header.batch === batch)
    .sort((a, b) => a.ticket - b.ticket);

  if (selected.length === 0) refuse(`no ticket has Batch: ${batch}`);

  const state = {
    branches: branches(main),
    merged: lines(gitOut(main, ['branch', '--merged', MAIN, '--format=%(refname:short)'])),
    worktrees: worktrees(main),
    landed: landedBranches(main),
  };

  const laneOf = lanes(
    selected.map(({ ticket, header, plan }) => ({
      number: ticket,
      depends: header.depends,
      touches: plan == null ? [] : parseTouches(plan),
    })),
  );

  const rows = selected.map((ticket) => {
    const ticketState = ticketGit(ticket.ticket, state);
    const counts = ticketState.branch
      ? gitOut(main, ['rev-list', '--left-right', '--count', `${MAIN}...${ticketState.branch}`])
          .split(/\s+/)
          .map(Number)
      : null;

    return statusRow({
      ...ticket,
      git: ticketState,
      counts: counts && { behind: counts[0], ahead: counts[1] },
      lane: laneOf.get(ticket.ticket),
    });
  });

  console.log(formatTable(rows).join('\n'));
}

function commandNew(main, { ticket, type }) {
  const { folder } = findTicket(main, ticket);
  const branch = branchName({ type, ticket, slug: slugOf(folder) });
  const dir = worktreePath(main, ticket);

  if (git(main, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).ok) {
    refuse(`branch ${branch} already exists`);
  }

  if (existsSync(dir)) refuse(`${dir} already exists`);

  const added = git(main, ['worktree', 'add', '-b', branch, dir, MAIN]);

  if (!added.ok) refuse(`git worktree add failed: ${added.err.split('\n').at(-1)}`);

  console.log(`worktree ${dir} on ${branch}`);

  const log = openLog(main, String(ticket));

  for (const [label, args] of [
    ['pnpm install', ['install']],
    ['pnpm check', ['check']],
  ]) {
    const result = step(log, label, 'pnpm', args, dir);

    if (!result.ok) {
      console.log(tail(result.output).join('\n'));
      refuse(`${label} failed in the new worktree; full log: ${path.relative(main, log)}`);
    }
  }
}

function commandLand(main, { ticket, message }) {
  const found = findTicket(main, ticket);
  const tree = worktrees(main).find((candidate) => ticketOfWorktree(candidate) === ticket);

  if (!tree) refuse(`no worktree for ticket ${ticket}; run pnpm ticket new ${ticket}`);

  const { path: dir, branch } = tree;

  if (!branch) refuse(`${dir} has no branch checked out`);

  const current = git(main, ['symbolic-ref', '--short', 'HEAD']).out;

  if (current !== MAIN) {
    refuse(`the main checkout ${main} is on "${current || 'a detached HEAD'}", not ${MAIN}`);
  }

  const dirty = gitOut(dir, ['status', '--porcelain', '--untracked-files=all']);

  if (dirty) refuse(`${dir} has uncommitted changes:\n${dirty}`);

  const start = gitOut(main, ['rev-parse', MAIN]);
  const rebased = git(dir, ['rebase', MAIN]);

  if (!rebased.ok) {
    const conflicts = lines(git(dir, ['diff', '--name-only', '--diff-filter=U']).out);

    git(dir, ['rebase', '--abort']);
    refuse(
      conflicts.length > 0
        ? `git rebase ${MAIN} conflicts in ${conflicts.join(', ')}; aborted, nothing changed`
        : `git rebase ${MAIN} failed; aborted, nothing changed:\n${rebased.err}`,
    );
  }

  const ahead = Number(gitOut(dir, ['rev-list', '--count', `${MAIN}..HEAD`]));

  if (ahead === 0) refuse(`${branch} has no commits ahead of ${MAIN}`);

  if (ahead > 1 && !message) {
    refuse(`${branch} is ${ahead} commits ahead of ${MAIN}; pass -m "<message>" to squash them`);
  }

  const problem = message && checkCommitMessage(message);

  if (problem) refuse(`-m: ${problem}`);

  const files = lines(gitOut(dir, ['diff', '--name-only', `${MAIN}...HEAD`]));
  const tier = tierOf(found.plan == null ? null : parseTouches(found.plan));
  const id = patchId(dir);

  if (tier === 'full' && TESTER_CHECK) {
    if (!hasTesterRow(readLedger(main), { ticket, patchId: id, worker: LAND })) {
      refuse(`full tier: no tester row in .idea/ledger.tsv for patch-id ${id}`);
    }
  } else if (tier === 'full') console.log('full tier: tester check off until ticket 236');

  const gates = [...BASE_GATES, ...affectedRuns(files)];
  const log = openLog(main, String(ticket));

  for (const gate of gates) {
    const result = step(log, `pnpm ${gate}`, 'pnpm', gate.split(' '), dir);

    if (!result.ok) {
      appendLedger(main, {
        ticket,
        patchId: id,
        level: 'failed',
        evidence: `pnpm ${gate}`,
        verifier: LAND,
      });
      console.log(tail(result.output).join('\n'));
      refuse(`pnpm ${gate} is red; ${MAIN} untouched; full log: ${path.relative(main, log)}`);
    }
  }

  if (message && !(ahead === 1 && gitOut(dir, ['log', '-1', '--format=%B']).trim() === message)) {
    const tip = gitOut(dir, ['rev-parse', 'HEAD']);

    gitOut(dir, ['reset', '--soft', MAIN]);

    const committed = step(log, 'git commit', 'git', ['commit', '--quiet', '-m', message], dir);

    if (!committed.ok) {
      git(dir, ['reset', '--soft', tip]);
      console.log(tail(committed.output).join('\n'));
      refuse(`the squash commit failed; ${branch} is back at ${tip.slice(0, 8)}`);
    }
  }

  appendLedger(main, {
    ticket,
    patchId: patchId(dir),
    level: landLevel(gates),
    evidence: gates.map((gate) => `pnpm ${gate}`).join(', '),
    verifier: LAND,
  });

  if (gitOut(main, ['rev-parse', MAIN]) !== start) refuse(`${MAIN} moved; run land again`);

  const merged = git(main, ['merge', '--ff-only', '--quiet', branch]);

  if (!merged.ok) refuse(`git merge --ff-only refused; ${MAIN} untouched:\n${merged.err}`);

  console.log(`${MAIN} ${gitOut(main, ['log', '-1', '--format=%h %s', MAIN])}`);
  console.log(`git worktree remove ${dir} && git branch -d ${branch}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.error) {
    console.error(`ticket: ${options.error}. ${USAGE}`);
    process.exit(2);
  }

  try {
    const root = mainCheckout();
    const commands = {
      new: commandNew,
      land: commandLand,
      status: commandStatus,
      next: commandNext,
    };

    commands[options.command](root, options);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;

    console.error(`ticket ${options.command}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
