import { googleOAuth } from '@frogbotai/piece-google';
import { definePiece } from 'frogbot/pieces';

import { customApiCall } from './actions/customApiCall.js';
import {
  addAttendees,
  createEvent,
  createQuickEvent,
  deleteEvent,
  updateEvent,
} from './actions/events.js';
import { findFreeBusyPeriods, getEvent, listEvents } from './actions/read.js';
import { createGoogleCalendarClient } from './client.js';
import { googleCalendarAuth, googleCalendarScopes } from './config.js';

export const googleCalendarActions = [
  'addAttendees',
  'createQuickEvent',
  'createEvent',
  'listEvents',
  'updateEvent',
  'deleteEvent',
  'findFreeBusyPeriods',
  'getEvent',
  'customApiCall',
] as const;
export { googleCalendarScopes };

export const createGoogleCalendar = definePiece({
  slug: 'google-calendar',
  label: 'Google Calendar',
  admin: {
    description: 'Manage calendar events, attendees, and availability',
    group: 'Productivity',
  },
  auth: googleCalendarAuth,
  client: createGoogleCalendarClient,
  oauth: {
    ...googleOAuth,
    scopes: [...googleOAuth.scopes, ...googleCalendarScopes],
    toAuth: ({ tokens }) => ({
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token,
    }),
  },
  actions: [
    addAttendees,
    createQuickEvent,
    createEvent,
    listEvents,
    updateEvent,
    deleteEvent,
    findFreeBusyPeriods,
    getEvent,
    customApiCall,
  ],
});
