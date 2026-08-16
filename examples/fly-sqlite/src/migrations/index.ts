import * as migration_20260816_224743_init from './20260816_224743_init';

export const migrations = [
  {
    up: migration_20260816_224743_init.up,
    down: migration_20260816_224743_init.down,
    name: '20260816_224743_init',
  },
];
