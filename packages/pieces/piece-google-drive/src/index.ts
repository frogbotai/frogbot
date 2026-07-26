import * as module from "@activepieces/piece-google-drive";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

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
export const googleDriveScopes = [
  "https://www.googleapis.com/auth/drive"
] as const;

export function createGoogleDrive(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "google-drive",
    credentialType: "oauth2",
    defaultActions: googleDriveActions,
    scopes: googleDriveScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create new folder: Create a new empty folder in your Google Drive */
    createNewGdriveFolder: piece.tool("create_new_gdrive_folder"),
    /** Create new file: Create a new text file in your Google Drive from text */
    createNewGdriveFile: piece.tool("create_new_gdrive_file"),
    /** Upload file: Upload a file in your Google Drive */
    uploadGdriveFile: piece.tool("upload_gdrive_file"),
    /** Read File Content: Read a selected file from google drive file */
    readFile: piece.tool("read-file"),
    /** Get File Information: Get a file folder for files/sub-folders */
    getFileOrFolderById: piece.tool("get-file-or-folder-by-id"),
    /** List files: List files from a Google Drive folder */
    listFiles: piece.tool("list-files"),
    /** Search: Search a Google Drive folder for files/sub-folders */
    searchFolder: piece.tool("search-folder"),
    /** Duplicate File: Duplicate a file from Google Drive. Returns the new file ID. */
    duplicateFile: piece.tool("duplicate_file"),
    /** Save Document as PDF: Save a document as PDF in a Google Drive folder */
    saveFileAsPdf: piece.tool("save_file_as_pdf"),
    /** Update permissions: Update permissions for a file or folder */
    updatePermissions: piece.tool("update_permissions"),
    /** Delete permissions: Removes a role from an user for a file or folder */
    deletePermissions: piece.tool("delete_permissions"),
    /** Set public access: Set public access for a file or folder */
    setPublicAccess: piece.tool("set_public_access"),
    /** Move File: Moves a file from one folder to another. */
    googleDriveMoveFile: piece.tool("google-drive-move-file"),
    /** Delete file: Delete permanently a file from your Google Drive */
    deleteGdriveFile: piece.tool("delete_gdrive_file"),
    /** Trash file: Move a file to the trash in your Google Drive */
    trashGdriveFile: piece.tool("trash_gdrive_file"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
