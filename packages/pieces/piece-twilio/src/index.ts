import * as module from '@activepieces/piece-twilio';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const twilioActions = ['send_sms', 'phone_number_lookup', 'make_call', 'get_message'] as const;
export const twilioScopes = [] as const;

export function createTwilio(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "twilio",
    credentialType: "basic_auth",
    defaultActions: twilioActions,
    scopes: twilioScopes,
    config,
  });
  return Object.assign(piece, {
    /** Send SMS: Send a new SMS message */
    sendSms: piece.tool("send_sms"),
    /** Phone Number Lookup: Lookup information about a phone number. */
    phoneNumberLookup: piece.tool("phone_number_lookup"),
    /** Call Phone: Call a number and say a message. */
    makeCall: piece.tool("make_call"),
    /** Get Message: Retrieves the details of a specific message. */
    getMessage: piece.tool("get_message"),
    /** Download Recording Media: Download the media file for a specific recording. */
    downloadRecordingMedia: piece.tool("download_recording_media"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
