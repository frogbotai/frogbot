import * as module from '@activepieces/piece-pagerduty';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const pagerdutyActions = ['create_incident', 'list_incidents', 'get_incident', 'acknowledge_incident', 'resolve_incident'] as const;
export const pagerdutyScopes = [] as const;

export function createPagerduty(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "pagerduty",
    credentialType: "secret_text",
    defaultActions: pagerdutyActions,
    scopes: pagerdutyScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Incident: Create a new PagerDuty incident using the REST API. */
    createIncident: piece.tool("create_incident"),
    /** List Incidents: List PagerDuty incidents with optional filters and pagination. */
    listIncidents: piece.tool("list_incidents"),
    /** Get Incident: Retrieve a PagerDuty incident by ID. */
    getIncident: piece.tool("get_incident"),
    /** Acknowledge Incident: Acknowledge an existing PagerDuty incident. */
    acknowledgeIncident: piece.tool("acknowledge_incident"),
    /** Resolve Incident: Resolve an existing PagerDuty incident. */
    resolveIncident: piece.tool("resolve_incident"),
    /** Custom API Call: Make a custom API call to PagerDuty REST API v2. Authorization, Accept, and Content-Type headers are injected automatically. For write endpoints that require a From header, add it manually in the headers field. */
    customApiCall: piece.tool("custom_api_call"),
  });
}
