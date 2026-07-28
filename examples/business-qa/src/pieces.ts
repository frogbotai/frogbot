import { createDataSummarizer } from '@frogbotai/piece-data-summarizer';
import { createDateHelper } from '@frogbotai/piece-date-helper';
import { createGoogleCalendar } from '@frogbotai/piece-google-calendar';
import { createGoogleDrive } from '@frogbotai/piece-google-drive';
import { createGoogleSheets } from '@frogbotai/piece-google-sheets';
import { createLinear } from '@frogbotai/piece-linear';
import { createPdf } from '@frogbotai/piece-pdf';
import { createResend } from '@frogbotai/piece-resend';

const google = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
};

export const googleSheets = createGoogleSheets({ auth: google });
export const googleDrive = createGoogleDrive({ auth: google });
export const googleCalendar = createGoogleCalendar({ auth: google });
export const linear = createLinear();
export const resend = createResend({
  auth: { apiKey: process.env.RESEND_API_KEY ?? '' },
});
export const dateHelper = createDateHelper();
export const dataSummarizer = createDataSummarizer();
export const pdf = createPdf();

export const pieces = [
  googleSheets,
  googleDrive,
  googleCalendar,
  linear,
  resend,
  dateHelper,
  dataSummarizer,
  pdf,
];
