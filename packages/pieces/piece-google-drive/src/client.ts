import type { FrogbotRequest } from 'frogbot';
import type { PieceRunArgs } from 'frogbot/pieces';
import { type drive_v3, google } from 'googleapis';
import { z } from 'zod';

export const googleDriveAuth = z.object({
  accessToken: z.string().min(1).meta({ secret: true }),
  refreshToken: z.string().optional().meta({ secret: true }),
});

export type GoogleDriveAuth = z.output<typeof googleDriveAuth>;
export type GoogleDriveClient = drive_v3.Drive;
export type DriveRunArgs<T extends z.ZodType> = PieceRunArgs<
  z.output<T>,
  object,
  GoogleDriveClient
>;

export function createGoogleDriveClient({ auth }: { auth: unknown }): GoogleDriveClient {
  const credential = googleDriveAuth.parse(auth);
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: credential.accessToken });
  return google.drive({ version: 'v3', auth: oauth });
}

export function requestOptions(req: FrogbotRequest) {
  req.signal?.throwIfAborted();
  return {
    signal: req.signal ?? undefined,
    timeout: 30_000,
    retry: false,
    maxRedirects: 0,
    redirect: 'error' as const,
  };
}
