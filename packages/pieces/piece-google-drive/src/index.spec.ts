import * as module from "@activepieces/piece-google-drive";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { googleDrive, googleDriveActions } from "./index.js";
pieceContract({
  piece: googleDrive,
  service: "google-drive",
  credentialType: "oauth2",
  actions: googleDriveActions,
});
credentialExecution({
  module,
  piece: googleDrive,
  service: "google-drive",
  credential: { access_token: "google-test" },
});
