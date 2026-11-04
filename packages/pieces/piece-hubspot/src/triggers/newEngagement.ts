import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { crmRecord } from '../records.js';
import {
  baseline,
  emit,
  epochOf,
  floorOf,
  type PollItem,
  readCursor,
  schedule,
  searchSince,
} from './poll.js';

const shared = ['hs_timestamp', 'hubspot_owner_id', 'hs_createdate', 'hs_lastmodifieddate'];

const activities = {
  NOTE: { objectType: 'notes', properties: ['hs_note_body'] },
  EMAIL: {
    objectType: 'emails',
    properties: ['hs_email_subject', 'hs_email_text', 'hs_email_direction', 'hs_email_status'],
  },
  CALL: {
    objectType: 'calls',
    properties: [
      'hs_call_title',
      'hs_call_body',
      'hs_call_direction',
      'hs_call_duration',
      'hs_call_status',
    ],
  },
  MEETING: {
    objectType: 'meetings',
    properties: [
      'hs_meeting_title',
      'hs_meeting_body',
      'hs_meeting_start_time',
      'hs_meeting_end_time',
      'hs_meeting_outcome',
    ],
  },
  TASK: {
    objectType: 'tasks',
    properties: ['hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_task_priority'],
  },
} as const;

type ActivityType = keyof typeof activities;

const activityTypes = Object.keys(activities) as ActivityType[];

const output = z.object({
  type: z.enum(['NOTE', 'EMAIL', 'CALL', 'MEETING', 'TASK']),
  record: crmRecord,
});

export const newEngagement = definePollingTrigger({
  slug: 'newEngagement',
  description:
    'Emit each new activity (note, email, call, meeting or task), optionally of one type, from the v3 activity objects.',
  type: 'polling',
  schedule,
  input: z.object({
    eventType: z
      .enum(['NOTE', 'EMAIL', 'CALL', 'MEETING', 'TASK'])
      .optional()
      .meta({ label: 'Activity type', description: 'Every type when empty.' }),
  }),
  output,
  async run({ client, input, cursor, req }) {
    const now = Date.now();
    const previous = readCursor(cursor);

    if (!previous) return baseline(now);

    const floor = floorOf(previous);
    const items: PollItem<z.output<typeof output>>[] = [];
    let reached = now;

    for (const type of input.eventType ? [input.eventType] : activityTypes) {
      const { objectType, properties } = activities[type];
      const { records, truncated } = await searchSince(client, {
        objectType,
        timeProperty: 'hs_createdate',
        floor,
        properties: [...shared, ...properties],
        signal: signal(req),
      });

      items.push(
        ...records.map((record) => ({
          id: `${objectType}:${record.id}`,
          epoch: epochOf(record, 'hs_createdate'),
          event: { type, record },
        })),
      );

      if (truncated) {
        const last = Math.max(
          ...records.map((record) => epochOf(record, 'hs_createdate')).filter(Number.isFinite),
        );

        reached = Math.min(reached, Math.max(previous.since, last));
      }
    }

    return emit(previous, items, reached);
  },
});
