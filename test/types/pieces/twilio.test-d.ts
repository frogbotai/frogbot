import { createTwilio } from '@frogbotai/piece-twilio';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const twilio = createTwilio({});
const developerTwilio = createTwilio({ auth: { username: 'AC1', password: 'token' } });

const _sms = twilio.sendSms({
  input: { from: '+15550000000', to: '+15551111111', body: 'Hi' },
  req,
});

expectTypeOf<Parameters<typeof twilio.sendSms>[0]['input']>().toEqualTypeOf<{
  from: string;
  to: string;
  body: string;
}>();
expectTypeOf<Awaited<typeof _sms>['sid']>().toEqualTypeOf<string>();
expectTypeOf(developerTwilio.getMessage({ input: { messageSid: 'SM1' } })).toEqualTypeOf<
  ReturnType<typeof twilio.getMessage>
>();

// @ts-expect-error sendSms does not accept getMessage input
twilio.sendSms({ input: { messageSid: 'SM1' }, req });

const _recording = twilio.downloadRecording({ input: { recordingSid: 'RE1' }, req });

expectTypeOf<Awaited<typeof _recording>['mimeType']>().toEqualTypeOf<string>();

expectTypeOf<keyof typeof twilio.triggers>().toEqualTypeOf<
  | 'incomingSms'
  | 'phoneNumberAdded'
  | 'recordingCompleted'
  | 'transcriptionCompleted'
  | 'callCompleted'
>();
expectTypeOf(twilio.triggers.incomingSms.type).toEqualTypeOf<'polling'>();
