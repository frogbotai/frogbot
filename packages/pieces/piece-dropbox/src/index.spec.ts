import * as module from "@activepieces/piece-dropbox";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { createDropbox, dropboxActions } from './index.js';

const dropbox = createDropbox();
pieceContract({
  piece: dropbox,
  service: "dropbox",
  credentialType: "oauth2",
  actions: dropboxActions,
});
credentialExecution({
  module,
  piece: dropbox,
  service: "dropbox",
  credential: { access_token: "dropbox-test" },
});
