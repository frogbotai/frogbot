/** The `next` range `@frogbotai/next` accepts as a peer, so an app can take any version in it without a FrogBot release. */
export const NEXT_PEER_RANGE = '>=16.4.0 <17.0.0';

const REGISTRY = 'https://registry.npmjs.org';

const MAX_ROUNDS = 5;

type Version = [number, number, number];

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
  vulnerableRanges: string[];
  version: string;
};

function parseVersion(text: string): undefined | Version {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());

  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function formatVersion(version: Version): string {
  return version.join('.');
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function nextPatch(version: Version): Version {
  return [version[0], version[1], version[2] + 1];
}

function parseRange(range: string): Comparator[][] | undefined {
  const sets: Comparator[][] = [];

  for (const part of range.split('||')) {
    const set: Comparator[] = [];

    for (const token of part.trim().split(/\s+/).filter(Boolean)) {
      if (token === '*') continue;

      const match = /^(<=|>=|<|>|=)?(.+)$/.exec(token);
      const version = match && parseVersion(match[2]);

      if (!match || !version) return undefined;

      set.push({ op: (match[1] ?? '=') as Comparator['op'], version });
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
    if (op === '<' || op === '>=') return [version];
    if (op === '<=' || op === '>') return [nextPatch(version)];

    return [version, nextPatch(version)];
  });
}

/**
 * Finds the lowest version at or above `version`, inside `peerRange`, that no vulnerable range covers.
 * Candidates are the range edges, so the answer is a version an advisory names as its fix.
 * Throws when a version or range isn't plain `1.2.3` comparators joined by spaces and `||`.
 */
export function findNextFix({
  peerRange,
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

  const candidates = [current, ...boundaries(peer), ...ranges.flatMap(boundaries)]
    .filter((candidate) => compare(candidate, current) >= 0 && satisfies(candidate, peer))
    .sort(compare);

  const fix = candidates.find((candidate) => !ranges.some((sets) => satisfies(candidate, sets)));

  return fix && formatVersion(fix);
}

type BulkAdvisory = {
  id: number;
  severity: string;
  title: string;
  url: string;
  vulnerable_versions: string;
};

async function queryAdvisories(
  props: Required<Pick<NextAdvisoriesCheckProps, 'fetch' | 'registry' | 'timeoutMs'>>,
  version: string,
): Promise<NextAdvisory[]> {
  const response = await props.fetch(`${props.registry}/-/npm/v1/security/advisories/bulk`, {
    body: JSON.stringify({ next: [version] }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(props.timeoutMs),
  });

  if (!response.ok) throw new Error(`npm advisories answered ${response.status}`);

  const body = (await response.json()) as { next?: BulkAdvisory[] };

  return (body.next ?? []).map((advisory) => ({
    id: advisory.id,
    severity: advisory.severity,
    title: advisory.title,
    url: advisory.url,
    vulnerableVersions: advisory.vulnerable_versions,
  }));
}

async function published(
  props: Required<Pick<NextAdvisoriesCheckProps, 'fetch' | 'registry' | 'timeoutMs'>>,
  version: string,
): Promise<boolean> {
  const response = await props.fetch(`${props.registry}/next/${version}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(props.timeoutMs),
  });

  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`npm registry answered ${response.status}`);

  return true;
}

/**
 * Asks npm's bulk advisory endpoint about a `next` version and finds the version that fixes it.
 * Each candidate fix is checked against npm too, so an advisory that only covers newer versions still counts.
 * Returns `undefined` when the registry can't be reached or answers with an error.
 */
export async function checkNextAdvisories({
  fetch = globalThis.fetch,
  peerRange = NEXT_PEER_RANGE,
  registry = REGISTRY,
  timeoutMs = 5000,
  version,
}: NextAdvisoriesCheckProps): Promise<NextAdvisoryReport | undefined> {
  const props = { fetch, registry, timeoutMs };

  try {
    const advisories = await queryAdvisories(props, version);

    if (advisories.length === 0) return { advisories, fix: version, peerRange, version };

    const ranges = new Set(advisories.map((advisory) => advisory.vulnerableVersions));

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const fix = findNextFix({ peerRange, version, vulnerableRanges: [...ranges] });

      if (!fix) return { advisories, fix: undefined, peerRange, version };

      const fixAdvisories = await queryAdvisories(props, fix);

      if (fixAdvisories.length === 0 && (await published(props, fix))) {
        return { advisories, fix, peerRange, version };
      }

      ranges.add(fix);

      for (const advisory of fixAdvisories) ranges.add(advisory.vulnerableVersions);
    }

    return undefined;
  } catch {
    return undefined;
  }
}
