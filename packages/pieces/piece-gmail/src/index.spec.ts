import * as module from "@activepieces/piece-gmail";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { createGmail, gmailActions } from './index.js';

const gmail = createGmail();
pieceContract({
  piece: gmail,
  service: "gmail",
  credentialType: "oauth2",
  actions: gmailActions,
});
credentialExecution({
  module,
  piece: gmail,
  service: "gmail",
  credential: { access_token: "google-test" },
});
