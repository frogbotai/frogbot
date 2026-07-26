import * as module from '@activepieces/piece-xml';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const xmlActions = ['convert-json-to-xml'] as const;
export const xmlScopes = [] as const;

export function createXml(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "xml",
    credentialType: "none",
    defaultActions: xmlActions,
    scopes: xmlScopes,
    config,
  });
  return Object.assign(piece, {
    /** Convert JSON to XML: Convert JSON to XML */
    convertJsonToXml: piece.tool("convert-json-to-xml"),
    /** Convert XML to JSON: Convert XML to JSON */
    convertXmlToJson: piece.tool("convert-xml-to-json"),
  });
}
