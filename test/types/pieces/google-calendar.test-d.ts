import { createGoogleCalendar } from '@frogbotai/piece-google-calendar';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const googleCalendar = createGoogleCalendar({ auth: { accessToken: 'token' } });

const _quickEvent = googleCalendar.createQuickEvent({
  input: { calendarId: 'primary', text: 'Lunch tomorrow at noon' },
  req,
});

expectTypeOf<Parameters<typeof googleCalendar.createQuickEvent>[0]['input']>().toEqualTypeOf<{
  calendarId: string;
  text: string;
  sendUpdates?: 'all' | 'externalOnly' | 'none' | undefined;
}>();

expectTypeOf<Awaited<typeof _quickEvent>['htmlLink']>().toEqualTypeOf<string | null | undefined>();

const _createQuickEventRejectsDeleteEventInput = () =>
  // @ts-expect-error createQuickEvent does not accept deleteEvent input
  googleCalendar.createQuickEvent({ input: { calendarId: 'primary', eventId: 'event' }, req });

const deleted = googleCalendar.deleteEvent({
  input: { calendarId: 'primary', eventId: 'event' },
  req,
});

expectTypeOf(deleted).toEqualTypeOf<Promise<{ deleted: true }>>();

const app = { clientId: 'client', clientSecret: 'secret' };

createGoogleCalendar({
  oauth: app,
  scopes: ({ defaultScopes }) => [...defaultScopes, 'calendar.events.readonly'],
});

// @ts-expect-error calendar.event is not a Google Calendar scope name
createGoogleCalendar({ oauth: app, scopes: ['calendar.event'] });
