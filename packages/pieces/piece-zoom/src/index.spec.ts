import * as module from "@activepieces/piece-zoom";
import { pieceContract } from "frogbot/pieces/test";

import { credentialExecution } from "../../credential-execution.js";
import { createZoom, zoomActions } from './index.js';

const zoom = createZoom();
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
