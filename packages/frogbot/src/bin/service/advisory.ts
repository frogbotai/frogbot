import {
  checkNextAdvisories,
  describeNextAdvisories,
  installedNextVersion,
  NEXT_PEER_RANGE,
} from '../nextAdvisories.js';

const DOCS = 'https://docs.frogbot.ai/getting-started/upgrading-next';

/** Whether a failed build's output is Next refusing to build a version with a security advisory. */
export const isSecurityFailure = (output: string): boolean => output.includes('SecurityFatalError');

/** What Next's refusal means when npm can't be asked which version fixes it. */
export const securityFallback = (version = 'next'): string =>
  `Next refused to build: ${version === 'next' ? 'next' : `next ${version}`} has a security advisory; install a patched version inside ${NEXT_PEER_RANGE} (${DOCS})`;

/**
 * What npm said about the installed `next` `version`: `line` is the advisory line, `undefined` when it
 * has none. `offline` when npm couldn't be asked, so nothing is known about this version.
 */
export type AdvisoryResult = { version: string; line?: string; offline?: true };

/** Options for {@link createAdvisor}. */
export type AdvisorCreateProps = {
  dir: string;
  check?: typeof checkNextAdvisories;
};

/**
 * Asks npm about the app's installed `next` once per version. Resolves `undefined` when no `next`
 * is installed, and an `offline` result when npm can't be reached; a failed ask is tried again on the
 * next call.
 */
export function createAdvisor({
  dir,
  check = checkNextAdvisories,
}: AdvisorCreateProps): () => Promise<AdvisoryResult | undefined> {
  let last: { version: string; result: Promise<AdvisoryResult | undefined> } | undefined;

  return () => {
    const version = installedNextVersion(dir);

    if (!version) return Promise.resolve(undefined);
    if (last?.version === version) return last.result;

    const entry = {
      version,
      result: check({ version })
        .catch(() => undefined)
        .then((report) => {
          if (!report) {
            if (last === entry) last = undefined;

            return { version, offline: true as const };
          }

          return { version, line: describeNextAdvisories(report, dir) };
        }),
    };

    last = entry;

    return entry.result;
  };
}
