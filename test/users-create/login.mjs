import { getFrogBot } from 'frogbot';

import config from './frogbot.config.mjs';

const [email, password, action] = process.argv.slice(2);
const frogbot = await getFrogBot({ config, disableOnInit: true });

if (action === 'unverify') {
  const { docs } = await frogbot.db.find({ collection: 'users', limit: 1, pagination: false });

  await frogbot.db.updateOne({ collection: 'users', id: docs[0].id, data: { _verified: false } });
}

if (action === 'trash') {
  const { docs } = await frogbot.find({ collection: 'users', overrideAccess: true });

  await frogbot.update({
    collection: 'users',
    id: docs[0].id,
    data: { deletedAt: new Date().toISOString() },
    overrideAccess: true,
  });
}

const response = await frogbot.handleRequest(
  new Request('http://localhost/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }),
);

const { docs } = await frogbot.db.find({ collection: 'users', limit: 10, pagination: false });

process.stdout.write(`RESULT ${JSON.stringify({ status: response.status, users: docs.length })}\n`);
