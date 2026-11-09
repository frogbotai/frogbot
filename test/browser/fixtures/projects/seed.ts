import config from '@frogbot-config';
import { getFrogBot } from 'frogbot';

import { seed } from '../../../../templates/projects/src/seed/index';
import { user } from '../../__helpers/signIn';
import { today } from '../crm/shared';

const frogbot = await getFrogBot({ config });

const owner = await frogbot.create({
  collection: 'users',
  data: { email: user.email, password: user.password },
  overrideAccess: true,
});

await seed({
  frogbot,
  req: await frogbot.createRequest({ user: { ...owner, collection: 'users' } }),
  today,
});
