import { googleProvider } from '@frogbotai/plugin-oauth';

const googleCredentials = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
};

export const googleProviders = [
  googleProvider({
    ...googleCredentials,
    service: 'google-sheets',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  }),
  googleProvider({
    ...googleCredentials,
    service: 'google-drive',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive'],
  }),
  googleProvider({
    ...googleCredentials,
    service: 'google-calendar',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar'],
  }),
];
