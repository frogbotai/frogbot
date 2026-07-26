import * as module from "@activepieces/piece-google-sheets";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { createGoogleSheets, googleSheetsActions } from './index.js';

const googleSheets = createGoogleSheets();
pieceContract({
  piece: googleSheets,
  service: "google-sheets",
  credentialType: "oauth2",
  actions: googleSheetsActions,
});
credentialExecution({
  module,
  piece: googleSheets,
  service: "google-sheets",
  credential: { access_token: "google-test" },
});
