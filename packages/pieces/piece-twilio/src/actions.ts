import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { TwilioClient } from './client.js';

const resource = z.looseObject({ sid: z.string() });
const phoneNumber = z.string().min(1);
const makeCallInput = z.object({
  from: phoneNumber,
  to: phoneNumber,
  message: z.string().min(1),
  voice: z.enum(['alice', 'man', 'woman']).optional(),
  language: z.enum(['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE']).optional(),
  sendDigits: z.string().optional(),
  timeout: z.number().int().positive().optional(),
});
const downloadRecordingInput = z.object({
  recordingSid: z.string().min(1),
  format: z.enum(['mp3', 'wav']).default('mp3'),
  channels: z.union([z.literal(1), z.literal(2)]).optional(),
});
const customApiCallInput = z.object({
  method: z.string().default('GET'),
  path: z.string().regex(/^\/(?!\/)/),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

type Args<T> = PieceRunArgs<T, object, TwilioClient>;

async function phoneNumberOptions({ client }: { client: TwilioClient }) {
  const numbers: { friendly_name: string; phone_number: string }[] = [];
  let path: string | null = `/2010-04-01/Accounts/${client.accountSid}/IncomingPhoneNumbers.json`;
  let query: Record<string, unknown> | undefined = { PageSize: 1000 };

  while (path) {
    const body = (await client.request({ path, query })) as {
      incoming_phone_numbers?: { friendly_name: string; phone_number: string }[];
      next_page_uri?: string | null;
    };

    numbers.push(...(body.incoming_phone_numbers ?? []));
    path = typeof body.next_page_uri === 'string' ? body.next_page_uri : null;
    query = undefined;
  }

  return numbers.map((number) => ({
    label: number.friendly_name,
    value: number.phone_number,
  }));
}

export const sendSms = {
  slug: 'sendSms',
  description: 'Send an SMS message',
  idempotent: false,
  input: z.object({ from: phoneNumber, to: phoneNumber, body: z.string().min(1) }),
  output: resource,
  options: { from: phoneNumberOptions },
  async run({ input, client }: Args<{ from: string; to: string; body: string }>) {
    return client.request({
      method: 'POST',
      path: `/2010-04-01/Accounts/${client.accountSid}/Messages.json`,
      body: { From: input.from, To: input.to, Body: input.body },
    });
  },
};

export const lookupPhoneNumber = {
  slug: 'lookupPhoneNumber',
  description: 'Look up carrier and line-type information for a phone number',
  idempotent: true,
  input: z.object({ phoneNumber }),
  output: z.looseObject({ phone_number: z.string() }),
  async run({ input, client }: Args<{ phoneNumber: string }>) {
    return client.request({
      service: 'lookup',
      path: `/v2/PhoneNumbers/${encodeURIComponent(input.phoneNumber)}`,
      query: { Fields: 'line_type_intelligence' },
    });
  },
};

export const makeCall = {
  slug: 'makeCall',
  description: 'Call a number and speak a message',
  idempotent: false,
  input: makeCallInput,
  output: resource,
  options: { from: phoneNumberOptions },
  async run({ input, client }: Args<z.output<typeof makeCallInput>>) {
    const attributes = [
      input.voice ? ` voice="${input.voice}"` : '',
      input.language ? ` language="${input.language}"` : '',
    ].join('');
    const message = input.message
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');

    return client.request({
      method: 'POST',
      path: `/2010-04-01/Accounts/${client.accountSid}/Calls.json`,
      body: {
        From: input.from,
        To: input.to,
        Twiml: `<Response><Say${attributes}>${message}</Say></Response>`,
        SendDigits: input.sendDigits,
        Timeout: input.timeout,
      },
    });
  },
};

export const getMessage = {
  slug: 'getMessage',
  description: 'Get a message by SID',
  idempotent: true,
  input: z.object({ messageSid: z.string().min(1) }),
  output: resource,
  async run({ input, client }: Args<{ messageSid: string }>) {
    return client.request({
      path: `/2010-04-01/Accounts/${client.accountSid}/Messages/${encodeURIComponent(input.messageSid)}.json`,
    });
  },
};

export const downloadRecording = {
  slug: 'downloadRecording',
  description: 'Download a call recording',
  idempotent: true,
  input: downloadRecordingInput,
  output: z.object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    mimeType: z.string(),
    url: z.string().optional(),
  }),
  async run({ input, client, req }: Args<z.output<typeof downloadRecordingInput>>) {
    const data = await client.request({
      path: `/2010-04-01/Accounts/${client.accountSid}/Recordings/${encodeURIComponent(input.recordingSid)}.${input.format}`,
      query: { RequestedChannels: input.channels },
      binary: true,
    });

    const collection = req.frogbot.config.files?.slug;

    if (!collection) throw new Error('[frogbot] Twilio recordings require the files collection.');

    const name = `${input.recordingSid}.${input.format}`;
    const mimeType = input.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    const bytes = Buffer.from(data as Uint8Array);
    const doc = await req.frogbot.create({
      collection,
      data: {},
      file: { data: bytes, name, mimetype: mimeType, size: bytes.length },
      req,
      overrideAccess: false,
    });

    return { id: doc.id, name, mimeType, url: typeof doc.url === 'string' ? doc.url : undefined };
  },
};

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Make a custom Twilio REST API call',
  input: customApiCallInput,
  output: z.unknown(),
  async run({ input, client }: Args<z.output<typeof customApiCallInput>>) {
    return client.request(input);
  },
};
