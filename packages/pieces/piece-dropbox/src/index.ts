import * as module from "@activepieces/piece-dropbox";
import { createActivepiecesPiece } from "frogbot/pieces";

export const dropboxActions = [
  "search_dropbox",
  "create_new_dropbox_text_file",
  "upload_dropbox_file",
  "downloadFile",
  "get_dropbox_file_link",
  "delete_dropbox_file",
  "move_dropbox_file",
  "copy_dropbox_file",
  "create_new_dropbox_folder",
  "list_dropbox_folder",
] as const;
export const dropbox = createActivepiecesPiece({
  module,
  service: "dropbox",
  credentialType: "oauth2",
  defaultActions: dropboxActions,
});
