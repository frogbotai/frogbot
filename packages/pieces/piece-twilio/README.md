# `@frogbotai/piece-twilio`

Send messages, place calls, retrieve Twilio resources, and poll communication events.

## Usage

```ts
import { createTwilio } from '@frogbotai/piece-twilio';

export const twilio = createTwilio({
  auth: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
  },
});
```

## Actions

| Upstream action slug       | Previous wrapper export  | Native action       | Notes                                 |
| -------------------------- | ------------------------ | ------------------- | ------------------------------------- |
| `send_sms`                 | `sendSms`                | `sendSms`           |                                       |
| `phone_number_lookup`      | `phoneNumberLookup`      | `lookupPhoneNumber` | Semantic verb-first name.             |
| `make_call`                | `makeCall`               | `makeCall`          |                                       |
| `get_message`              | `getMessage`             | `getMessage`        |                                       |
| `download_recording_media` | `downloadRecordingMedia` | `downloadRecording` | Returns recording bytes and metadata. |
| `custom_api_call`          | `customApiCall`          | `customApiCall`     | Uses the Twilio REST API base URL.    |

## Triggers

| Upstream trigger slug | Native trigger           | Type      | Notes                                       |
| --------------------- | ------------------------ | --------- | ------------------------------------------- |
| `new_incoming_sms`    | `incomingSms`            | `polling` | Filters for inbound messages to one number. |
| `new_phone_number`    | `phoneNumberAdded`       | `polling` |                                             |
| `new_recording`       | `recordingCompleted`     | `polling` |                                             |
| `new_transcription`   | `transcriptionCompleted` | `polling` | Emits completed transcriptions.             |
| `new_call`            | `callCompleted`          | `polling` | Emits completed calls.                      |
