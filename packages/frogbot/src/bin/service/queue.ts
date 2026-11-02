/**
 * Runs `run` one at a time: triggers during a run collapse into one follow-up run, as OpenCode v2's
 * plugin supervisor does with `Queue.sliding(1)`.
 */
export function createBuildQueue(run: () => Promise<unknown>) {
  let pending = false;
  let current: Promise<void> | undefined;

  async function loop() {
    do {
      pending = false;

      try {
        await run();
      } catch {}
    } while (pending);

    current = undefined;
  }

  return {
    trigger(): void {
      if (current) {
        pending = true;

        return;
      }

      current = loop();
    },
    idle(): Promise<void> {
      return current ?? Promise.resolve();
    },
    get busy(): boolean {
      return current !== undefined;
    },
  };
}
