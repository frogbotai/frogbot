import type { FrogbotRequest } from 'frogbot';
import { type calendar_v3, google } from 'googleapis';

import { googleCalendarAuth } from './config.js';

export type GoogleCalendar = calendar_v3.Calendar;

export function createGoogleCalendarClient({ auth }: { auth: unknown }) {
  const credential = googleCalendarAuth.parse(auth);
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
  });
  return google.calendar({ version: 'v3', auth: oauth });
}

export function requestOptions(req: FrogbotRequest) {
  req.signal?.throwIfAborted();
  return { signal: req.signal ?? undefined, retry: false };
}
