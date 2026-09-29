import { createGoogle } from '@frogbotai/piece-google';
import type {
  FrogBotInstance,
  FrogBotRequest,
  Subscription,
  SubscriptionEnableProps,
} from 'frogbot';
import { definePiece } from 'frogbot/pieces';
import { z } from 'zod';

import { defineAction } from './pieces-define.js';

export const google = createGoogle({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});

const auth = z.object({ token: z.string().min(1) });

const lookup = defineAction({
  slug: 'lookup',
  description: 'Look up an item',
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  async run({ client, input }) {
    const response = await fetch(`https://api.example.com/items/${input.id}`, {
      headers: { authorization: `Bearer ${client.token}` },
    });

    return response.json();
  },
});

export const createExample = definePiece({
  slug: 'example',
  label: 'Example',
  auth,
  client: ({ auth: credential }) => ({ token: auth.parse(credential).token }),
  actions: [lookup],
});

const piece = createExample({});

export async function lookupItem(req: FrogBotRequest) {
  const result = await piece.lookup({
    input: { id: '123' },
    req,
  });

  return result;
}

export async function enableMountedTrigger({
  frogbot,
  mount,
}: {
  frogbot: FrogBotInstance;
  mount: SubscriptionEnableProps;
}) {
  const subscription = await frogbot.triggers.enable(mount);
  const subscriptions = await frogbot.triggers.list();

  return { subscription, subscriptions };
}

export async function disableMountedTrigger({
  frogbot,
  subscription,
}: {
  frogbot: FrogBotInstance;
  subscription: Subscription;
}) {
  await frogbot.triggers.disable(subscription.id);
}
