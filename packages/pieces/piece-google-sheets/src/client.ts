import { type drive_v3, google, type sheets_v4 } from 'googleapis';

import { googleSheetsAuth } from './config.js';

export type GoogleSheetsClient = {
  auth: InstanceType<typeof google.auth.OAuth2>;
  sheets: sheets_v4.Sheets;
  drive: drive_v3.Drive;
};

export function createGoogleSheetsClient({ auth }: { auth: unknown }): GoogleSheetsClient {
  const credential = googleSheetsAuth.parse(auth);
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: credential.accessToken });
  return {
    auth: oauth,
    sheets: google.sheets({ version: 'v4', auth: oauth, universeDomain: 'googleapis.com' }),
    drive: google.drive({ version: 'v3', auth: oauth, universeDomain: 'googleapis.com' }),
  };
}
