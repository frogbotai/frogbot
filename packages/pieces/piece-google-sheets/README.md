# `@frogbotai/piece-google-sheets`

Read and write Google Sheets spreadsheets.

## Usage

```ts
import { createGoogle } from '@frogbotai/piece-google';
import { createGoogleSheets } from '@frogbotai/piece-google-sheets';

export const google = createGoogle({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});
export const googleSheets = createGoogleSheets({ oauth: google.oauth });
```

## OAuth scopes

Change the requested scopes with the factory's `scopes` option: `createGoogleSheets({ oauth, scopes: ({ defaultScopes }) => [...defaultScopes, 'spreadsheets.readonly'] })` adds one, and an array replaces the defaults. `googleSheetsScopes` maps each name to the provider's scope string. Names stand for `https://www.googleapis.com/auth/<name>`, except `openid`.

- Always requested: `openid`, `userinfo.email`, `userinfo.profile`.
- Defaults: `spreadsheets`, `drive.readonly`, `drive`.
- Also available: `spreadsheets.readonly`, `drive.file`.
