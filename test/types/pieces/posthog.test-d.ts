import { createPosthog } from '@frogbotai/piece-posthog';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const posthog = createPosthog({ auth: { personalApiKey: 'key' } });

const _project = posthog.createProject({ input: { name: 'Frogs', isDemo: true }, req });

expectTypeOf<Parameters<typeof posthog.createProject>[0]['input']>().toEqualTypeOf<{
  name?: string | undefined;
  slackIncomingWebhook?: string | undefined;
  anonymizeIps?: boolean | undefined;
  isDemo?: boolean | undefined;
}>();

expectTypeOf<Awaited<typeof _project>['api_token']>().toEqualTypeOf<string>();

const _createProjectRejectsCreateEventInput = () =>
  posthog.createProject({
    // @ts-expect-error createProject does not accept createEvent input
    input: { event: 'signup', eventType: 'capture', distinctId: 'u1' },
    req,
  });

const _response = posthog.customApiCall({ input: { method: 'GET', path: '/api/projects/' }, req });

expectTypeOf<Awaited<typeof _response>['status']>().toEqualTypeOf<number>();
