import * as module from "@activepieces/piece-gmail";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { gmail, gmailActions } from "./index.js";
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
