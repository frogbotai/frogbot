import * as migration_20261004_050945_init from './20261004_050945_init';

export const migrations = [
  {
    up: migration_20261004_050945_init.up,
    down: migration_20261004_050945_init.down,
    name: '20261004_050945_init',
  },
];
