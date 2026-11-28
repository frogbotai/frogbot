import { describe, expect, it } from 'vitest';

import { pieceCapabilities } from '../../../packages/frogbot/src/pieces/types.js';
import { createOkta } from '../../../packages/pieces/piece-okta/src/index.js';

const oauth = { clientId: 'id', clientSecret: 'secret' };

describe('createOkta', () => {
  it('names the issuer when it is missing, as an unset env var leaves it', () => {
    expect(() => createOkta({ issuer: process.env.OKTA_ISSUER_NOT_SET!, oauth })).toThrow(
      "Piece 'okta' OAuth issuer must be an HTTP URL.",
    );
  });

  it("drops a trailing slash, which Okta's issuers never have", () => {
    const okta = createOkta({ issuer: 'https://acme.okta.com/oauth2/default/', oauth });

    expect(okta[pieceCapabilities].oauth).toMatchObject({
      issuer: 'https://acme.okta.com/oauth2/default',
    });
  });
});
