import type { FrogbotRequest } from 'frogbot';

import { type GoogleCalendar, requestOptions } from '../client.js';

type CalendarOptionsArgs = { client: GoogleCalendar; req: FrogbotRequest };

export const calendars =
  (minAccessRole?: 'writer') =>
  async ({ client, req }: CalendarOptionsArgs) => {
    const options: Array<{ label: string; value: string }> = [];
    let pageToken: string | undefined;
    do {
      const { data } = await client.calendarList.list(
        { maxResults: 250, minAccessRole, pageToken },
        requestOptions(req),
      );
      for (const calendar of data.items ?? []) {
        if (calendar.id) {
          options.push({
            label: calendar.summaryOverride ?? calendar.summary ?? calendar.id,
            value: calendar.id,
          });
        }
      }
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return options;
  };

export async function colors({ client, req }: CalendarOptionsArgs) {
  const { data } = await client.colors.get({}, requestOptions(req));
  return Object.entries(data.event ?? {}).map(([value, color]) => ({
    label: color.background ?? value,
    value,
  }));
}
