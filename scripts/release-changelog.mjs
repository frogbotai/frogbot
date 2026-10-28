import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

const REPO = 'https://github.com/frogbotai/frogbot';

export const SECTIONS = [
  ['feat', '🚀 Features'],
  ['fix', '🐛 Bug Fixes'],
  ['perf', '⚡ Performance'],
  ['refactor', '🛠 Refactors'],
  ['docs', '📚 Documentation'],
  ['style', '🎨 Styles'],
  ['test', '🧪 Tests'],
  ['build', '📦 Build'],
  ['ci', '⚙️ CI'],
  ['chore', '🏡 Chores'],
  ['revert', '⏪ Reverts'],
];

const SUBJECT = /^(\w+)(?:\(([a-z0-9-]+)\))?(!)?: (.+)$/;

const BUMP = /^chore(?:: bump version\b|\(release\):)/;

const BREAKING = /^BREAKING[ -]CHANGE: /;

const FOOTER = /^(?:[\w-]+: |[\w-]+ #)/;

const ISSUE = / \(#(\d+)\)$/;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });

  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);

  return result.stdout;
}

function previousTag(cwd, to) {
  const head = git(cwd, ['rev-parse', `${to}^{commit}`]).trim();
  const tags = git(cwd, ['tag', '--merged', to, '--list', 'v*', '--sort=-v:refname'])
    .split('\n')
    .filter(Boolean);

  return tags.find((tag) => git(cwd, ['rev-parse', `${tag}^{commit}`]).trim() !== head);
}

function readVersion(cwd, to) {
  const manifest =
    to === 'HEAD'
      ? readFileSync(path.join(cwd, 'package.json'), 'utf8')
      : git(cwd, ['show', `${to}:package.json`]);

  return JSON.parse(manifest).version;
}

function footers(body) {
  const notes = [];
  let open = false;

  for (const line of body.split('\n')) {
    if (BREAKING.test(line)) {
      notes.push([line.replace(BREAKING, '')]);
      open = true;
    } else if (open && line.trim() && !FOOTER.test(line)) {
      notes.at(-1).push(line);
    } else {
      open = false;
    }
  }

  return notes.flat();
}

function commits(cwd, from, to) {
  const log = git(cwd, [
    'log',
    '--format=%H%x1f%an%x1f%ae%x1f%s%x1f%b%x1e',
    from ? `${from}..${to}` : to,
  ]);

  const types = new Set(SECTIONS.map(([type]) => type));

  return log
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .flatMap((record) => {
      const [hash, name, email, subject, body = ''] = record.split('\x1f');
      const match = SUBJECT.exec(subject);

      if (!match || !types.has(match[1]) || BUMP.test(subject)) return [];

      const [, type, scope, bang, description] = match;
      const notes = footers(body);

      return [
        {
          hash,
          name,
          email,
          type,
          scope,
          description,
          breaking: !!bang || notes.length > 0,
          notes,
        },
      ];
    });
}

function entry({ hash, scope, description }) {
  const issue = ISSUE.exec(description);
  const text = issue ? description.slice(0, issue.index) : description;
  const links = [
    ...(issue ? [`[#${issue[1]}](${REPO}/issues/${issue[1]})`] : []),
    `[${hash.slice(0, 7)}](${REPO}/commit/${hash})`,
  ];

  return `* ${scope ? `**${scope}:** ` : ''}${text} ${links.map((link) => `(${link})`).join(' ')}`;
}

function sorted(list) {
  return list
    .map((commit, index) => ({ commit, index }))
    .sort(
      (a, b) =>
        (a.commit.scope ? 1 : 0) - (b.commit.scope ? 1 : 0) ||
        (a.commit.scope ?? '').localeCompare(b.commit.scope ?? '') ||
        a.index - b.index,
    )
    .map(({ commit }) => commit);
}

export function githubLogin(hash, cwd = ROOT) {
  const result = spawnSync(
    'gh',
    ['api', `repos/frogbotai/frogbot/commits/${hash}`, '--jq', '.author.login'],
    { cwd, encoding: 'utf8' },
  );

  const login = result.status === 0 ? result.stdout.trim() : '';

  return login && login !== 'null' ? login : undefined;
}

/**
 * @param {{ version?: string, from?: string, to?: string, cwd?: string, date?: Date, login?: (hash: string) => string | undefined }} [options]
 */
export function releaseNotes({
  version,
  from,
  to = 'HEAD',
  cwd = ROOT,
  date = new Date(),
  login = (hash) => githubLogin(hash, cwd),
} = {}) {
  const base = from ?? previousTag(cwd, to);
  const tag = `v${version ?? readVersion(cwd, to)}`;
  const day = date.toISOString().slice(0, 10);
  const list = commits(cwd, base, to);

  const blocks = [
    base ? `## [${tag}](${REPO}/compare/${base}...${tag}) (${day})` : `## ${tag} (${day})`,
  ];

  for (const [type, title] of SECTIONS) {
    const section = sorted(list.filter((commit) => commit.type === type));

    if (section.length) blocks.push([`### ${title}`, ...section.map(entry)].join('\n'));
  }

  const breaking = sorted(list.filter((commit) => commit.breaking));

  if (breaking.length) {
    blocks.push(
      [
        '### ⚠️ BREAKING CHANGES',
        ...breaking.map((commit) =>
          [entry(commit), ...commit.notes.map((line) => `  ${line}`)].join('\n'),
        ),
      ].join('\n'),
    );
  }

  const authors = new Map();

  for (const commit of list) {
    if (!authors.has(commit.email)) authors.set(commit.email, commit);
  }

  if (authors.size) {
    blocks.push(
      [
        '### 🤝 Contributors',
        ...[...authors.values()].map(({ name, hash }) => {
          const handle = login(hash);

          return handle ? `- ${name} (@${handle})` : `- ${name}`;
        }),
      ].join('\n'),
    );
  }

  return `${blocks.join('\n\n')}\n`;
}

const USAGE =
  'usage: node scripts/release-changelog.mjs [--from <tag>] [--to <ref>] [--version <x.y.z>]';

export function parseArgs(argv) {
  const options = {};
  const flags = { '--from': 'from', '--to': 'to', '--version': 'version' };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') continue;

    const key = flags[arg];

    if (!key || argv[i + 1] === undefined) return { error: `unknown argument "${arg}"\n${USAGE}` };

    options[key] = argv[++i];
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.error) {
    console.error(options.error);
    process.exit(1);
  }

  process.stdout.write(releaseNotes(options));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
