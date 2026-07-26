import * as module from "@activepieces/piece-github";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { createGithub, githubActions } from './index.js';

const github = createGithub();
pieceContract({
  piece: github,
  service: "github",
  credentialType: "oauth2",
  actions: githubActions,
});
credentialExecution({
  module,
  piece: github,
  service: "github",
  credential: { access_token: "github-test" },
});
