import * as migration_20261004_050945_init from './20261004_050945_init';
import * as migration_20261005_035332_concurrency_key from './20261005_035332_concurrency_key';

export const migrations = [
  {
    up: migration_20261004_050945_init.up,
    down: migration_20261004_050945_init.down,
    name: '20261004_050945_init',
  },
  {
    up: migration_20261005_035332_concurrency_key.up,
    down: migration_20261005_035332_concurrency_key.down,
    name: '20261005_035332_concurrency_key',
  },
];
