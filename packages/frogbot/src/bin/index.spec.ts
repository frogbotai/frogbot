import { describe, it } from 'vitest';

describe('frogbot bin', () => {
  it.todo('dispatches `start` to the start command');
  it.todo('dispatches `dev` to the dev command');
  it.todo('dispatches `generate:types` to the generateTypes command');
  it.todo('treats the command as case-insensitive');
  it.todo('prints `[frogbot] usage: frogbot <start|dev|generate:types>` and exits with code 2 on no args');
  it.todo('prints the same usage and exits with code 2 on an unknown command');
  it.todo('logs `[frogbot] error:` and exits 1 when the dispatched command rejects');
});
