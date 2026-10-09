import { type gmail_v1, google } from 'googleapis';

import { gmailAuth } from './config.js';

export type Gmail = gmail_v1.Gmail;

export function createGmailClient({ auth }: { auth: unknown }) {
  const credential = gmailAuth.parse(auth);
  const oauth = new google.auth.OAuth2();

  oauth.setCredentials({
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
  });

  return google.gmail({ version: 'v1', auth: oauth });
}

export async function authorize(client: Gmail, url: URL, headers: Headers) {
  const auth = client.context._options.auth;
  if (!auth || typeof auth === 'string') {
    throw new Error('[frogbot] Gmail client is missing authenticated transport.');
  }

  (await auth.getRequestHeaders(url)).forEach((value, key) => headers.set(key, value));
}
