import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { describeHybridSearch } from './hybrid.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describeHybridSearch({
  rankFusion: false,
  boot: async () => {
    const booted = await bootFrogBot(dirname, 'search-hybrid-union-with');

    await clearAndSeed(booted.frogbot, 'empty');

    return booted;
  },
});
