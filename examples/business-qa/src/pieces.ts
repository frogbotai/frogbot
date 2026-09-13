import { createDataSummarizer } from '@frogbotai/piece-data-summarizer';
import { createDateHelper } from '@frogbotai/piece-date-helper';
import { createGoogle } from '@frogbotai/piece-google';
import { createGoogleCalendar } from '@frogbotai/piece-google-calendar';
import { createGoogleDrive } from '@frogbotai/piece-google-drive';
import { createGoogleSheets } from '@frogbotai/piece-google-sheets';
import { createLinear } from '@frogbotai/piece-linear';
import { createPdf } from '@frogbotai/piece-pdf';
import { createResend } from '@frogbotai/piece-resend';
import type { ConnectionEntry } from 'frogbot';

export const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? createGoogle({
        oauth: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      })
    : undefined;

const configuredGooglePieces = google?.oauth
  ? {
      googleSheets: createGoogleSheets({ oauth: google.oauth }),
      googleDrive: createGoogleDrive({ oauth: google.oauth }),
      googleCalendar: createGoogleCalendar({ oauth: google.oauth }),
    }
  : undefined;

export const googleSheets =
  configuredGooglePieces?.googleSheets ?? createGoogleSheets();
export const googleDrive =
  configuredGooglePieces?.googleDrive ?? createGoogleDrive();
export const googleCalendar =
  configuredGooglePieces?.googleCalendar ?? createGoogleCalendar();
export const googleConnections = (
  configuredGooglePieces
    ? [
        { piece: configuredGooglePieces.googleSheets, oauth: true },
        { piece: configuredGooglePieces.googleDrive, oauth: true },
        { piece: configuredGooglePieces.googleCalendar, oauth: true },
      ]
    : []
) satisfies ConnectionEntry[];

export const linear = createLinear({
  ...(process.env.LINEAR_API_KEY
    ? { auth: { apiKey: process.env.LINEAR_API_KEY } }
    : {}),
});
export const resend = createResend({
  auth: { apiKey: process.env.RESEND_API_KEY ?? '' },
});
export const dateHelper = createDateHelper();
export const dataSummarizer = createDataSummarizer();
export const pdf = createPdf();

export const pieces = [
  ...(google ? [google] : []),
  linear,
  googleSheets,
  googleDrive,
  googleCalendar,
  dateHelper,
  dataSummarizer,
  pdf,
];
