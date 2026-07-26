import * as module from "@activepieces/piece-dropbox";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

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
export const dropboxScopes = [
  "files.metadata.write",
  "files.metadata.read",
  "files.content.write",
  "files.content.read"
] as const;

export function createDropbox(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "dropbox",
    credentialType: "oauth2",
    defaultActions: dropboxActions,
    scopes: dropboxScopes,
    config,
  });
  return Object.assign(piece, {
    /** Search: Search for files and folders */
    searchDropbox: piece.tool("search_dropbox"),
    /** Create New Text File: Create a new text file from text input */
    createNewDropboxTextFile: piece.tool("create_new_dropbox_text_file"),
    /** Upload file: Upload a file */
    uploadDropboxFile: piece.tool("upload_dropbox_file"),
    /** Download File: Download a File from Dropbox */
    downloadFile: piece.tool("downloadFile"),
    /** Get temporary file link: Get a temporary file link */
    getDropboxFileLink: piece.tool("get_dropbox_file_link"),
    /** Delete file: Delete a file */
    deleteDropboxFile: piece.tool("delete_dropbox_file"),
    /** Move file: Move a file */
    moveDropboxFile: piece.tool("move_dropbox_file"),
    /** Copy file: Copy a file */
    copyDropboxFile: piece.tool("copy_dropbox_file"),
    /** Create New Folder: Create a new empty folder */
    createNewDropboxFolder: piece.tool("create_new_dropbox_folder"),
    /** Delete folder: Delete a folder */
    deleteDropboxFolder: piece.tool("delete_dropbox_folder"),
    /** Move folder: Move a folder */
    moveDropboxFolder: piece.tool("move_dropbox_folder"),
    /** Copy folder: Copy a folder */
    copyDropboxFolder: piece.tool("copy_dropbox_folder"),
    /** List a folder: List the contents of a folder */
    listDropboxFolder: piece.tool("list_dropbox_folder"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
