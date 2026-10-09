import { createZoom } from '@frogbotai/piece-zoom';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const zoom = createZoom({ auth: { accessToken: 'token' } });

const _meeting = zoom.getMeeting({ input: { meeting_id: '123' }, req });

expectTypeOf<Parameters<typeof zoom.getMeeting>[0]['input']>().toEqualTypeOf<{
  meeting_id: string;
  occurrence_id?: string | undefined;
  show_previous_occurrences?: boolean | undefined;
}>();

expectTypeOf<Awaited<typeof _meeting>['join_url']>().toEqualTypeOf<string | undefined>();

const _getMeetingRejectsCreateMeetingRegistrantInput = () =>
  zoom.getMeeting({
    // @ts-expect-error getMeeting does not accept createMeetingRegistrant input
    input: { meeting_id: '123', first_name: 'Ada', email: 'ada@example.com' },
    req,
  });

const updated = zoom.updateMeeting({ input: { meeting_id: '123', topic: 'Frogs' }, req });

expectTypeOf(updated).toEqualTypeOf<
  Promise<{ success: true; message: 'Meeting updated successfully' }>
>();

const app = { clientId: 'client', clientSecret: 'secret' };

createZoom({
  oauth: app,
  scopes: ({ defaultScopes }) => [...defaultScopes, 'meeting:delete:meeting'],
});

// @ts-expect-error meeting:remove:meeting is not a Zoom scope name
createZoom({ oauth: app, scopes: ['meeting:remove:meeting'] });
