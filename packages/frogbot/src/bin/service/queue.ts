/** What a run does: `update` builds and swaps, `restart` swaps in a new server on the current build. */
export type RunKind = 'update' | 'restart';

/**
 * Runs `run` one at a time: triggers during a run collapse into one follow-up run, as OpenCode v2's
 * plugin supervisor does with `Queue.sliding(1)`. The follow-up is an `update` when any collapsed
 * trigger was one, since a build also restarts.
 */
export function createBuildQueue(run: (kind: RunKind) => Promise<unknown>) {
  let pending: RunKind | undefined;
  let current: Promise<void> | undefined;

  async function loop(kind: RunKind) {
    for (let next: RunKind | undefined = kind; next; next = pending) {
      pending = undefined;

      try {
        await run(next);
      } catch {}
    }

    current = undefined;
  }

  return {
    trigger(kind: RunKind = 'update'): void {
      if (current) {
        pending = pending === 'update' ? 'update' : kind;

        return;
      }

      current = loop(kind);
    },
    idle(): Promise<void> {
      return current ?? Promise.resolve();
    },
    get busy(): boolean {
      return current !== undefined;
    },
  };
}
