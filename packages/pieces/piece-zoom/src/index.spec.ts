import * as module from "@activepieces/piece-zoom";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { zoom, zoomActions } from "./index.js";
pieceContract({
  piece: zoom,
  service: "zoom",
  credentialType: "oauth2",
  actions: zoomActions,
});
credentialExecution({
  module,
  piece: zoom,
  service: "zoom",
  credential: { access_token: "zoom-test" },
});
