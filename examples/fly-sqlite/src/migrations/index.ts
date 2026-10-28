import * as migration_20261004_050945_init from './20261004_050945_init';
import * as migration_20261005_035332_concurrency_key from './20261005_035332_concurrency_key';
import * as migration_20261017_181504_upgrade from './20261017_181504_upgrade';
import * as migration_20261028_070224_ai_policy_plugin from './20261028_070224_ai_policy_plugin';

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
  {
    up: migration_20261017_181504_upgrade.up,
    down: migration_20261017_181504_upgrade.down,
    name: '20261017_181504_upgrade',
  },
  {
    up: migration_20261028_070224_ai_policy_plugin.up,
    down: migration_20261028_070224_ai_policy_plugin.down,
    name: '20261028_070224_ai_policy_plugin',
  },
];
