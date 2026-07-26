import * as module from '@activepieces/piece-qrcode';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const qrcodeActions = ['text_to_qrcode'] as const;
export const qrcodeScopes = [] as const;

export function createQrcode(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "qrcode",
    credentialType: "none",
    defaultActions: qrcodeActions,
    scopes: qrcodeScopes,
    config,
  });
  return Object.assign(piece, {
    /** Text to QR Code: Convert text to QR code */
    textToQrcode: piece.tool("text_to_qrcode"),
  });
}
