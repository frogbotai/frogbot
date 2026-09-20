import { createGoogle } from '@frogbotai/piece-google';
import type {
  FrogbotInstance,
  FrogbotRequest,
  Subscription,
  SubscriptionEnableProps,
} from 'frogbot';
import { definePiece } from 'frogbot/pieces';
import { z } from 'zod';

export const google = createGoogle({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});

const auth = z.object({ token: z.string().min(1) });
const lookupInput = z.object({ id: z.string() });

export const createExample = definePiece({
  slug: 'example',
  label: 'Example',
  auth,
  client: ({ auth: credential }) => ({ token: auth.parse(credential).token }),
  actions: [
    {
      slug: 'lookup',
      description: 'Look up an item',
      input: lookupInput,
      output: z.object({ id: z.string() }),
      async run({ input }) {
        const data = lookupInput.parse(input);

        return { id: data.id };
      },
    },
  ],
});

const piece = createExample({});

export async function lookupItem(req: FrogbotRequest) {
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
  frogbot: FrogbotInstance;
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
  frogbot: FrogbotInstance;
  subscription: Subscription;
}) {
  await frogbot.triggers.disable(subscription.id);
}
