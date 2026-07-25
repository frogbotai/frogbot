import * as module from "@activepieces/piece-notion";
import { createActivepiecesPiece } from "frogbot/pieces";

export const notionActions = [
  "list_databases",
  "create_database_item",
  "update_database_item",
  "notion-find-database-item",
  "list_database_pages",
  "createPage",
  "append_to_page",
  "getPageOrBlockChildren",
  "add_comment",
  "find_page",
] as const;
export const notion = createActivepiecesPiece({
  module,
  service: "notion",
  credentialType: "oauth2",
  defaultActions: notionActions,
});
