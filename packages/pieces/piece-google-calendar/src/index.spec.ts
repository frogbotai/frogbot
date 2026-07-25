import * as module from "@activepieces/piece-google-calendar";
import { pieceContract } from "frogbot/pieces/test";
import { credentialExecution } from "../../credential-execution.js";
import { googleCalendar, googleCalendarActions } from "./index.js";
pieceContract({
  piece: googleCalendar,
  service: "google-calendar",
  credentialType: "oauth2",
  actions: googleCalendarActions,
});
credentialExecution({
  module,
  piece: googleCalendar,
  service: "google-calendar",
  credential: { access_token: "google-test" },
});
