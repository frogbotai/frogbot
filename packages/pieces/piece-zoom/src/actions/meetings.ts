import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { ZoomClient } from '../client.js';

const audio = z.enum(['both', 'telephony', 'voip', 'thirdParty']);
const autoRecording = z.enum(['local', 'cloud', 'none']);
const occurrence = z.object({
  duration: z.number(),
  occurrence_id: z.string(),
  start_time: z.string(),
  status: z.string(),
});
const meeting = z.object({
  id: z.number().optional(),
  assistant_id: z.string().optional(),
  host_email: z.string().optional(),
  registration_url: z.string().optional(),
  agenda: z.string().optional(),
  created_at: z.string().optional(),
  duration: z.number().optional(),
  join_url: z.string().optional(),
  occurrences: z.array(occurrence.partial()).optional(),
  password: z.string().optional(),
  pmi: z.number().optional(),
  pre_schedule: z.boolean().optional(),
  start_time: z.string(),
  start_url: z.string(),
  timezone: z.string(),
  topic: z.string(),
  type: z.number(),
  settings: z.object({
    approval_type: z.number(),
    audio: z.string(),
    auto_recording: z.string(),
    host_video: z.boolean(),
    join_before_host: z.boolean(),
    mute_upon_entry: z.boolean(),
    participant_video: z.boolean(),
    waiting_room: z.boolean().optional(),
  }),
});

const createMeetingInput = z.object({
  topic: z.string().min(1),
  start_time: z.string().optional(),
  duration: z.number().optional(),
  auto_recording: autoRecording.optional(),
  audio: audio.optional(),
  agenda: z.string().optional(),
  password: z
    .string()
    .max(10)
    .regex(/^[A-Za-z0-9@_*-]*$/)
    .optional(),
  pre_schedule: z.boolean().optional(),
  schedule_for: z.string().optional(),
  join_url: z.string().optional(),
});

export const createMeeting = {
  slug: 'createMeeting',
  label: 'Create meeting',
  description: 'Create a new Zoom meeting.',
  input: createMeetingInput,
  output: meeting,
  async run({
    input,
    client,
    req,
  }: PieceRunArgs<z.output<typeof createMeetingInput>, object, ZoomClient>) {
    const { auto_recording, audio: selectedAudio, ...fields } = input;
    const settings = {
      allow_multiple_devices: true,
      approval_type: 2,
      audio: selectedAudio ?? 'telephony',
      calendar_type: 1,
      close_registration: false,
      email_notification: true,
      host_video: true,
      join_before_host: false,
      meeting_authentication: true,
      mute_upon_entry: false,
      participant_video: false,
      private_meeting: false,
      registrants_confirmation_email: true,
      registrants_email_notification: true,
      registration_type: 1,
      show_share_button: true,
      host_save_video_order: true,
      ...(auto_recording ? { auto_recording } : {}),
    };

    return client({
      method: 'POST',
      path: '/users/me/meetings',
      body: {
        agenda: 'My Meeting',
        default_password: false,
        duration: 30,
        pre_schedule: false,
        timezone: 'UTC',
        type: 2,
        ...fields,
        settings,
      },
      signal: req.signal ?? undefined,
    });
  },
};

const meetingId = z.string().min(1);
const getMeetingInput = z.object({
  meeting_id: meetingId,
  occurrence_id: z.string().optional(),
  show_previous_occurrences: z.boolean().default(false),
});

export const getMeeting = {
  slug: 'getMeeting',
  label: 'Get meeting',
  description: 'Retrieve an existing Zoom meeting.',
  idempotent: true,
  input: getMeetingInput,
  output: meeting,
  options: {
    async meeting_id({ client }: { client: ZoomClient }) {
      const options: { label: string; value: string }[] = [];
      let nextPageToken = '';

      do {
        const response = await client({
          path: '/users/me/meetings',
          query: {
            type: 'scheduled',
            page_size: 300,
            next_page_token: nextPageToken || undefined,
          },
        });
        const page = z
          .object({
            meetings: z.array(z.object({ id: z.number(), topic: z.string() })),
            next_page_token: z.string(),
          })
          .parse(response);

        page.meetings.forEach(({ id, topic }) => {
          options.push({ label: topic || `Meeting ${id}`, value: String(id) });
        });

        nextPageToken = page.next_page_token;
      } while (nextPageToken);

      return { options };
    },
  },
  async run({
    input,
    client,
    req,
  }: PieceRunArgs<z.output<typeof getMeetingInput>, object, ZoomClient>) {
    return client({
      path: `/meetings/${encodeURIComponent(input.meeting_id)}`,
      query: {
        occurrence_id: input.occurrence_id,
        show_previous_occurrences: input.show_previous_occurrences || undefined,
      },
      signal: req.signal ?? undefined,
    });
  },
};

const updateMeetingInput = z.object({
  meeting_id: meetingId,
  topic: z.string().optional(),
  start_time: z.string().datetime({ offset: true }).optional(),
  duration: z.number().optional(),
  timezone: z.string().optional(),
  auto_recording: autoRecording.optional(),
  audio: audio.optional(),
  agenda: z.string().optional(),
  password: z
    .string()
    .max(10)
    .regex(/^[A-Za-z0-9@_*-]*$/)
    .optional(),
  host_video: z.boolean().optional(),
  participant_video: z.boolean().optional(),
  join_before_host: z.boolean().optional(),
  mute_upon_entry: z.boolean().optional(),
  waiting_room: z.boolean().optional(),
});
const updateMeetingOutput = z.object({
  success: z.literal(true),
  message: z.literal('Meeting updated successfully'),
});

export const updateMeeting = {
  slug: 'updateMeeting',
  label: 'Update meeting',
  description: 'Update an existing Zoom meeting.',
  idempotent: true,
  input: updateMeetingInput,
  output: updateMeetingOutput,
  options: getMeeting.options,
  async run({
    input,
    client,
    req,
  }: PieceRunArgs<z.output<typeof updateMeetingInput>, object, ZoomClient>) {
    const {
      meeting_id,
      auto_recording,
      audio: selectedAudio,
      host_video,
      participant_video,
      join_before_host,
      mute_upon_entry,
      waiting_room,
      ...body
    } = input;
    const settings = {
      auto_recording,
      audio: selectedAudio,
      host_video,
      participant_video,
      join_before_host,
      mute_upon_entry,
      waiting_room,
    };
    const definedSettings = Object.fromEntries(
      Object.entries(settings).filter((entry) => entry[1] !== undefined),
    );

    await client({
      method: 'PATCH',
      path: `/meetings/${encodeURIComponent(meeting_id)}`,
      body: {
        ...body,
        ...(Object.keys(definedSettings).length ? { settings: definedSettings } : {}),
      },
      signal: req.signal ?? undefined,
    });

    return updateMeetingOutput.parse({ success: true, message: 'Meeting updated successfully' });
  },
};
