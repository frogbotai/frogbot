import * as module from "@activepieces/piece-microsoft-teams";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { microsoftTeams, microsoftTeamsActions } from "./index.js";
pieceContract({
  piece: microsoftTeams,
  service: "microsoft-teams",
  credentialType: "oauth2",
  actions: microsoftTeamsActions,
});
credentialExecution({
  module,
  piece: microsoftTeams,
  service: "microsoft-teams",
  credential: { access_token: "microsoft-test" },
});
