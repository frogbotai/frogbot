import { definePiece, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { customApiCall } from './actions/customApiCall.js';
import { createMeeting, getMeeting, updateMeeting } from './actions/meetings.js';
import { createMeetingRegistrant } from './actions/registrants.js';
import { createZoomClient, type ZoomClient } from './client.js';
import { zoomAuth, zoomScopes } from './config.js';

const zoomOAuth: PieceOAuthRecipe<z.output<typeof zoomAuth>, ZoomClient> = {
  authorizationUrl: 'https://zoom.us/oauth/authorize',
  tokenUrl: 'https://zoom.us/oauth/token',
  tokenEndpointAuthMethod: 'client_secret_basic',
  scopes: [...zoomScopes],
  toAuth: ({ tokens }) => {
    if (!tokens.access_token?.trim()) {
      throw new Error('Zoom OAuth response did not include an access token.');
    }

    return zoomAuth.parse({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });
  },
  async account({ client, req }) {
    const response = await client({ path: '/users/me', signal: req.signal ?? undefined });
    const account = z
      .object({
        id: z.string().min(1),
        email: z.string().email(),
        display_name: z.string().optional(),
      })
      .parse(response);

    return {
      id: account.id,
      label: account.display_name?.trim() || account.email,
      email: account.email,
    };
  },
};

export const zoomActions = [
  'createMeeting',
  'createMeetingRegistrant',
  'getMeeting',
  'updateMeeting',
  'customApiCall',
];
export { zoomScopes };

export const createZoom = definePiece({
  slug: 'zoom',
  label: 'Zoom',
  admin: {
    description: 'Manage Zoom meetings and registrants',
    group: 'Communication',
  },
  auth: zoomAuth,
  client: createZoomClient,
  oauth: zoomOAuth,
  actions: [createMeeting, createMeetingRegistrant, getMeeting, updateMeeting, customApiCall],
});
