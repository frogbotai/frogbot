# `@frogbotai/piece-google-drive`

Store, find, organize, and share Google Drive files.

## Usage

```ts
import { createGoogle } from '@frogbotai/piece-google';
import { createGoogleDrive } from '@frogbotai/piece-google-drive';

export const google = createGoogle({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});
export const googleDrive = createGoogleDrive({ oauth: google.oauth });
```

## OAuth scopes

Change the requested scopes with the factory's `scopes` option: `createGoogleDrive({ oauth, scopes: ({ defaultScopes }) => [...defaultScopes, 'drive.file'] })` adds one, and an array replaces the defaults. `googleDriveScopes` maps each name to the provider's scope string. Names stand for `https://www.googleapis.com/auth/<name>`, except `openid`.

- Always requested: `openid`, `userinfo.email`, `userinfo.profile`.
- Defaults: `drive`.
- Also available: `drive.file`, `drive.readonly`, `drive.metadata`, `drive.metadata.readonly`, `drive.appdata`, `drive.activity`, `drive.activity.readonly`.
