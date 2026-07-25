import * as module from "@activepieces/piece-google-drive";
import { createActivepiecesPiece } from "frogbot/pieces";

export const googleDriveActions = [
  "create_new_gdrive_folder",
  "create_new_gdrive_file",
  "upload_gdrive_file",
  "read-file",
  "get-file-or-folder-by-id",
  "list-files",
  "search-folder",
  "duplicate_file",
  "save_file_as_pdf",
  "update_permissions",
  "delete_permissions",
  "set_public_access",
  "google-drive-move-file",
  "delete_gdrive_file",
  "trash_gdrive_file",
] as const;
export const googleDrive = createActivepiecesPiece({
  module,
  service: "google-drive",
  credentialType: "oauth2",
  defaultActions: googleDriveActions,
});
