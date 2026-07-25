import * as module from "@activepieces/piece-slack";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { slack, slackActions } from "./index.js";
pieceContract({
  piece: slack,
  service: "slack",
  credentialType: "oauth2",
  actions: slackActions,
});
credentialExecution({
  module,
  piece: slack,
  service: "slack",
  credential: { access_token: "slack-test" },
});
