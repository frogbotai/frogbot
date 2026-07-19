import { describe, it } from 'vitest';

describe('frogbot dev command', () => {
  it.todo('spawns `tsx watch <bin>.js start` against the resolved bin path');
  it.todo('inherits stdio from the parent process');
  it.todo('sets FROGBOT_WATCH_MODE=true in the child env');
  it.todo('forwards SIGINT to kill the child');
  it.todo('forwards SIGTERM to kill the child');
  it.todo('exits with the child\u2019s exit code when it terminates');
  it.todo('exits with code 0 when the child exits with a null code');
});
