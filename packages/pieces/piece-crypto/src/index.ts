import * as module from '@activepieces/piece-crypto';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const cryptoActions = ['hash-text', 'hmac-signature', 'generate-password', 'base64-decode', 'base64-encode', 'openpgpEncrypt'] as const;
export const cryptoScopes = [] as const;

export function createCrypto(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "crypto",
    credentialType: "none",
    defaultActions: cryptoActions,
    scopes: cryptoScopes,
    config,
  });
  return Object.assign(piece, {
    /** Text to Hash: Converts text to a hash value using various hashing algorithms */
    hashText: piece.tool("hash-text"),
    /** Generate HMAC Signature: Converts text to a HMAC signed hash value using various hashing algorithms */
    hmacSignature: piece.tool("hmac-signature"),
    /** Generate RSA Signature: Signs text with an RSA private key using SHA-256, SHA-384, or SHA-512 (RSA-SHA256 by default) */
    rsaSignature: piece.tool("rsa-signature"),
    /** Generate Password: Generates a random password with the specified length */
    generatePassword: piece.tool("generate-password"),
    /** Base64 Decode: Converts base64 text back to plain text. */
    base64Decode: piece.tool("base64-decode"),
    /** Base64 Encode: Converts plain text into base64 format. */
    base64Encode: piece.tool("base64-encode"),
    /** OpenPGP Encrypt: Encrypt a file using OpenPGP public key */
    openpgpEncrypt: piece.tool("openpgpEncrypt"),
  });
}
