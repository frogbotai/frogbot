import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { ZoomClient } from '../client.js';

const createRegistrantInput = z.object({
  meeting_id: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  email: z.string().email(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  comments: z.string().optional(),
  custom_questions: z.record(z.string(), z.string()).optional(),
  industry: z.string().optional(),
  job_title: z.string().optional(),
  no_of_employees: z
    .enum([
      '1-20',
      '21-50',
      '51-100',
      '101-500',
      '500-1,000',
      '1,001-5,000',
      '5,001-10,000',
      'More than 10,000',
    ])
    .optional(),
  org: z.string().optional(),
  purchasing_time_frame: z
    .enum(['Within a month', '1-3 months', '4-6 months', 'More than 6 months', 'No timeframe'])
    .optional(),
  role_in_purchase_process: z
    .enum(['Decision Maker', 'Evaluator/Recommender', 'Influencer', 'Not involved'])
    .optional(),
});
const registrant = z.object({
  id: z.number(),
  join_url: z.string(),
  registrant_id: z.string(),
  start_time: z.string(),
  topic: z.string(),
  occurrences: z.array(
    z.object({
      duration: z.number(),
      occurrence_id: z.string(),
      start_time: z.string(),
      status: z.string(),
    }),
  ),
  participant_pin_code: z.number(),
});

export const createMeetingRegistrant = {
  slug: 'createMeetingRegistrant',
  label: 'Create meeting registrant',
  description: 'Register an attendee for a Zoom meeting.',
  input: createRegistrantInput,
  output: registrant,
  async run({
    input,
    client,
    req,
  }: PieceRunArgs<z.output<typeof createRegistrantInput>, object, ZoomClient>) {
    const { meeting_id, custom_questions, ...body } = input;

    return client({
      method: 'POST',
      path: `/meetings/${encodeURIComponent(meeting_id)}/registrants`,
      body: {
        ...body,
        ...(custom_questions && Object.keys(custom_questions).length
          ? {
              custom_questions: Object.entries(custom_questions).map(([title, value]) => ({
                title,
                value,
              })),
            }
          : {}),
      },
      signal: req.signal ?? undefined,
    });
  },
};
