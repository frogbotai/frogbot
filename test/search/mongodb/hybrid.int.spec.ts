import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { describeHybridSearch } from './hybrid.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describeHybridSearch({ rankFusion: true, boot: () => bootFrogBot(dirname, 'search-hybrid') });
