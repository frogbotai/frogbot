import { definePiece } from 'frogbot/pieces';

import {
  customApiCall,
  downloadRecording,
  getMessage,
  lookupPhoneNumber,
  makeCall,
  sendSms,
} from './actions.js';
import { createTwilioClient } from './client.js';
import { twilioAuth, twilioOptions } from './config.js';
import {
  callCompleted,
  incomingSms,
  phoneNumberAdded,
  recordingCompleted,
  transcriptionCompleted,
} from './triggers.js';

export const twilioActions = [
  'sendSms',
  'lookupPhoneNumber',
  'makeCall',
  'getMessage',
  'downloadRecording',
  'customApiCall',
] as const;
export const twilioTriggers = [
  'incomingSms',
  'phoneNumberAdded',
  'recordingCompleted',
  'transcriptionCompleted',
  'callCompleted',
] as const;
export const twilioScopes = [] as const;

export const createTwilio = definePiece({
  slug: 'twilio',
  label: 'Twilio',
  admin: {
    description: 'Send messages, place calls, retrieve media, and monitor Twilio resources',
    group: 'Communication',
  },
  auth: twilioAuth,
  options: twilioOptions,
  client: createTwilioClient,
  actions: [sendSms, lookupPhoneNumber, makeCall, getMessage, downloadRecording, customApiCall],
  triggers: [
    incomingSms,
    phoneNumberAdded,
    recordingCompleted,
    transcriptionCompleted,
    callCompleted,
  ],
});
