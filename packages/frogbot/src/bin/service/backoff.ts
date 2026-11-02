/** A crashed server's restart delays: `initial` ms, doubling up to `max`, back to `initial` after `resetAfter` ms up. */
export function createBackoff({
  initial = 1000,
  max = 30_000,
  resetAfter = 60_000,
  now = Date.now,
} = {}) {
  let delay = initial;

  return {
    next(upSince: number): number {
      if (now() - upSince >= resetAfter) delay = initial;

      const wait = delay;

      delay = Math.min(delay * 2, max);

      return wait;
    },
  };
}
