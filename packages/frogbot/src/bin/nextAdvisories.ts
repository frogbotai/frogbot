import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The `next` range `@frogbotai/next` accepts as a peer, so an app can take any version in it without a FrogBot release. */
export const NEXT_PEER_RANGE = '>=16.4.0 <17.0.0';

const REGISTRY = 'https://registry.npmjs.org';

type Identifier = number | string;

type Version = { core: [major: number, minor: number, patch: number]; pre: Identifier[] };

type Comparator = { op: '<' | '<=' | '=' | '>' | '>='; version: Version };

/** One npm security advisory against a `next` version. */
export type NextAdvisory = {
  id: number;
  severity: string;
  title: string;
  url: string;
  vulnerableVersions: string;
};

/** What npm reports for an installed `next`, and the version that fixes it. */
export type NextAdvisoryReport = {
  advisories: NextAdvisory[];
  /** The lowest unaffected version inside the peer range, at or above `version`; `undefined` when only a FrogBot release can fix it. */
  fix: string | undefined;
  peerRange: string;
  version: string;
};

/** Options for {@link checkNextAdvisories}. */
export type NextAdvisoriesCheckProps = {
  fetch?: typeof globalThis.fetch;
  peerRange?: string;
  registry?: string;
  timeoutMs?: number;
  version: string;
};

/** Options for {@link findNextFix}. */
export type NextFixFindProps = {
  peerRange: string;
  /** Versions npm has published; when given, only these are candidates, so the fix is one an app can install. */
  published?: string[];
  vulnerableRanges: string[];
  version: string;
};

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(\+[\w.-]+)?$/;

const PARTIAL = /^v?(\d+)(?:\.(\d+))?(?:\.[x*])?$/i;

function identifier(text: string): Identifier {
  return /^\d+$/.test(text) ? Number(text) : text;
}

function parseVersion(text: string): undefined | Version {
  const match = VERSION.exec(text.trim());

  if (!match) return undefined;

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].slice(1).split('.').map(identifier) : [],
  };
}

function formatVersion({ core, pre }: Version): string {
  return pre.length ? `${core.join('.')}-${pre.join('.')}` : core.join('.');
}

function compareIdentifiers(a: Identifier, b: Identifier): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;

  return a < b ? -1 : a > b ? 1 : 0;
}

function compare(a: Version, b: Version): number {
  const core = a.core[0] - b.core[0] || a.core[1] - b.core[1] || a.core[2] - b.core[2];

  if (core) return core;
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length;

  for (let index = 0; index < Math.min(a.pre.length, b.pre.length); index++) {
    const order = compareIdentifiers(a.pre[index], b.pre[index]);

    if (order) return order;
  }

  return a.pre.length - b.pre.length;
}

function release(version: Version): Version {
  return { core: version.core, pre: [] };
}

function successor(version: Version): Version {
  const last = version.pre.at(-1);

  if (typeof last === 'number') {
    return { core: version.core, pre: [...version.pre.slice(0, -1), last + 1] };
  }

  if (version.pre.length) return { core: version.core, pre: [...version.pre, 0] };

  return { core: [version.core[0], version.core[1], version.core[2] + 1], pre: [] };
}

function parseComparator(op: Comparator['op'], text: string): Comparator[] | undefined {
  const version = parseVersion(text);

  if (version) return [{ op, version }];

  const partial = PARTIAL.exec(text.trim());

  if (!partial) return undefined;

  const major = Number(partial[1]);
  const minor = partial[2] === undefined ? undefined : Number(partial[2]);
  const low: Version = { core: [major, minor ?? 0, 0], pre: [0] };
  const high: Version = {
    core: minor === undefined ? [major + 1, 0, 0] : [major, minor + 1, 0],
    pre: [0],
  };

  if (op === '<' || op === '>=') return [{ op, version: low }];
  if (op === '<=') return [{ op: '<', version: high }];
  if (op === '>') return [{ op: '>=', version: high }];

  return [
    { op: '>=', version: low },
    { op: '<', version: high },
  ];
}

function parseRange(range: string): Comparator[][] | undefined {
  const sets: Comparator[][] = [];

  for (const part of range.replaceAll(/([<>=]+)\s+/g, '$1').split('||')) {
    const set: Comparator[] = [];

    for (const token of part.trim().split(/\s+/).filter(Boolean)) {
      if (token === '*') continue;

      const match = /^(<=|>=|<|>|=)?(.+)$/.exec(token);
      const comparators = match && parseComparator((match[1] ?? '=') as Comparator['op'], match[2]);

      if (!comparators) return undefined;

      set.push(...comparators);
    }

    sets.push(set);
  }

  return sets;
}

function holds(version: Version, { op, version: bound }: Comparator): boolean {
  const order = compare(version, bound);

  if (op === '<') return order < 0;
  if (op === '<=') return order <= 0;
  if (op === '>') return order > 0;
  if (op === '>=') return order >= 0;

  return order === 0;
}

function satisfies(version: Version, sets: Comparator[][]): boolean {
  return sets.some((set) => set.every((comparator) => holds(version, comparator)));
}

function boundaries(sets: Comparator[][]): Version[] {
  return sets.flat().flatMap(({ op, version }) => {
    const edges =
      op === '<' || op === '>='
        ? [version]
        : op === '='
          ? [version, successor(version)]
          : [successor(version)];

    return version.pre.length ? [...edges, release(version)] : edges;
  });
}

/**
 * Finds the lowest version at or above `version`, inside `peerRange`, that no vulnerable range covers.
 * Candidates are the `published` versions, or else the range edges, so the answer is a version an advisory names as its fix.
 * A prerelease is a candidate only when `version` is one. Versions compare per semver, prerelease identifiers included, as npm audit does.
 * Reads `<`, `<=`, `>`, `>=` and `=` comparators on full, partial (`16.4`, `16.4.x`) and prerelease versions, joined by spaces and `||`; throws on anything else.
 */
export function findNextFix({
  peerRange,
  published,
  version,
  vulnerableRanges,
}: NextFixFindProps): string | undefined {
  const current = parseVersion(version);
  const peer = parseRange(peerRange);
  const ranges: Comparator[][][] = [];

  for (const range of vulnerableRanges) {
    const sets = parseRange(range);

    if (sets) ranges.push(sets);
  }

  if (!current || !peer || ranges.length < vulnerableRanges.length) {
    throw new Error(`can't read the ranges for next ${version}`);
  }

  const edges = published
    ? published.flatMap((text) => parseVersion(text) ?? [])
    : [...boundaries(peer), ...ranges.flatMap(boundaries)];

  const inPeer = (candidate: Version) =>
    satisfies(candidate, peer) && satisfies(release(candidate), peer);

  const candidates = [current, ...edges]
    .filter(
      (candidate) =>
        compare(candidate, current) >= 0 &&
        (candidate === current || !candidate.pre.length || current.pre.length > 0) &&
        (candidate === current || inPeer(candidate)),
    )
    .sort(compare);

  const fix = candidates.find((candidate) => !ranges.some((sets) => satisfies(candidate, sets)));

  if (!fix) return undefined;

  return fix === current ? version : formatVersion(fix);
}

type BulkAdvisory = {
  id: number;
  severity: string;
  title: string;
  url: string;
  vulnerable_versions: string;
};

type RegistryProps = Required<Pick<NextAdvisoriesCheckProps, 'fetch' | 'registry' | 'timeoutMs'>>;

async function request(
  props: RegistryProps,
  path: string,
  init: RequestInit = {},
): Promise<Response | undefined> {
  try {
    return await props.fetch(`${props.registry}${path}`, {
      ...init,
      signal: AbortSignal.timeout(props.timeoutMs),
    });
  } catch {
    return undefined;
  }
}

async function queryAdvisories(
  props: RegistryProps,
  version: string,
): Promise<NextAdvisory[] | undefined> {
  const response = await request(props, '/-/npm/v1/security/advisories/bulk', {
    body: JSON.stringify({ next: [version] }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  if (!response?.ok) return undefined;

  const body = (await response.json().catch(() => undefined)) as
    undefined | { next?: BulkAdvisory[] };

  return (
    body?.next?.map((advisory) => ({
      id: advisory.id,
      severity: advisory.severity,
      title: advisory.title,
      url: advisory.url,
      vulnerableVersions: advisory.vulnerable_versions,
    })) ?? (body ? [] : undefined)
  );
}

async function publishedVersions(props: RegistryProps): Promise<string[] | undefined> {
  const response = await request(props, '/next', {
    headers: { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8' },
  });

  if (!response?.ok) return undefined;

  const body = (await response.json().catch(() => undefined)) as
    undefined | { versions?: Record<string, unknown> };

  return body?.versions ? Object.keys(body.versions) : undefined;
}

/**
 * Asks npm's bulk advisory endpoint about a `next` version and finds the version that fixes it.
 * Candidates are the versions npm has published, and each is checked against npm too, so an advisory that only covers newer versions still counts.
 * Returns `undefined` when the registry can't be reached or answers with an error, and throws when an advisory's range can't be read.
 */
export async function checkNextAdvisories({
  fetch = globalThis.fetch,
  peerRange = NEXT_PEER_RANGE,
  registry = REGISTRY,
  timeoutMs = 5000,
  version,
}: NextAdvisoriesCheckProps): Promise<NextAdvisoryReport | undefined> {
  const props = { fetch, registry, timeoutMs };

  const advisories = await queryAdvisories(props, version);

  if (!advisories) return undefined;
  if (advisories.length === 0) return { advisories, fix: version, peerRange, version };

  const published = await publishedVersions(props);

  if (!published) return undefined;

  const ranges = new Set(advisories.map((advisory) => advisory.vulnerableVersions));

  for (;;) {
    const fix = findNextFix({ peerRange, published, version, vulnerableRanges: [...ranges] });

    if (!fix) return { advisories, fix: undefined, peerRange, version };

    const fixAdvisories = await queryAdvisories(props, fix);

    if (!fixAdvisories) return undefined;
    if (fixAdvisories.length === 0) return { advisories, fix, peerRange, version };

    ranges.add(fix);

    for (const advisory of fixAdvisories) ranges.add(advisory.vulnerableVersions);
  }
}

const SEVERITIES = ['critical', 'high', 'moderate', 'low'];

const LOCKFILES: [file: string, command: string][] = [
  ['pnpm-lock.yaml', 'pnpm add'],
  ['package-lock.json', 'npm install'],
  ['yarn.lock', 'yarn add'],
  ['bun.lock', 'bun add'],
  ['bun.lockb', 'bun add'],
];

/**
 * The `next` version installed for the app in `dir`: the nearest `node_modules/next` in `dir` or a
 * folder above it, never one `NODE_PATH` adds. `undefined` when there is none.
 */
export function installedNextVersion(dir: string): string | undefined {
  for (let folder = dir; ; folder = dirname(folder)) {
    const file = join(folder, 'node_modules', 'next', 'package.json');

    if (existsSync(file)) {
      try {
        const { version } = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown };

        return typeof version === 'string' ? version : undefined;
      } catch {
        return undefined;
      }
    }

    if (dirname(folder) === folder) return undefined;
  }
}

/** The command that installs `next@<version>` with the package manager whose lockfile is in `dir`; pnpm when there is none. */
export function nextInstallCommand(dir: string, version: string): string {
  const command = LOCKFILES.find(([file]) => existsSync(join(dir, file)))?.[1] ?? 'pnpm add';

  return `${command} next@${version}`;
}

function severities(advisories: NextAdvisory[]): string {
  const counts = new Map<string, number>();

  for (const { severity } of advisories) counts.set(severity, (counts.get(severity) ?? 0) + 1);

  return [...counts]
    .sort(([a], [b]) => {
      const rank = (severity: string) =>
        SEVERITIES.includes(severity) ? SEVERITIES.indexOf(severity) : SEVERITIES.length;

      return rank(a) - rank(b);
    })
    .map(([severity, count]) => `${count} ${severity}`)
    .join(', ');
}

/**
 * One line that names a vulnerable `next`, its advisories and the fix, for example
 * ``next 16.4.2 has 7 security advisories (7 moderate); run `pnpm add next@16.4.6` (no FrogBot release needed)``.
 * `undefined` when the report has no advisories.
 */
export function describeNextAdvisories(
  report: NextAdvisoryReport,
  dir: string,
): string | undefined {
  const { advisories, fix, peerRange, version } = report;

  if (!advisories.length) return undefined;

  const found = `next ${version} has ${advisories.length} security ${advisories.length === 1 ? 'advisory' : 'advisories'} (${severities(advisories)})`;

  if (!fix) {
    return `${found} and no fixed version inside @frogbotai/next's range ${peerRange}; it needs a FrogBot release`;
  }

  return `${found}; run \`${nextInstallCommand(dir, fix)}\` (no FrogBot release needed)`;
}
