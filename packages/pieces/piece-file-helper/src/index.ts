import * as module from '@activepieces/piece-file-helper';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const fileHelperActions = ['createFile', 'read_file', 'get_file_name', 'checkFileType', 'change_file_encoding', 'zipFiles', 'unzipFile'] as const;
export const fileHelperScopes = [] as const;

export function createFileHelper(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "file_helper",
    credentialType: "none",
    defaultActions: fileHelperActions,
    scopes: fileHelperScopes,
    config,
  });
  return Object.assign(piece, {
    /** Read File: Read a file from the file system */
    readFile: piece.tool("read_file"),
    /** Create file: Create file from content */
    createFile: piece.tool("createFile"),
    /** Change File Encoding: Changes the encoding of a file */
    changeFileEncoding: piece.tool("change_file_encoding"),
    /** Check file type: Check MIME type of a file and filter based on selected types */
    checkFileType: piece.tool("checkFileType"),
    /** Zip Files: Create compressed zip file from one or many files */
    zipFiles: piece.tool("zipFiles"),
    /** Unzip File: Unzip compressed zip file */
    unzipFile: piece.tool("unzipFile"),
    /** Get File Name: Get the name of a file */
    getFileName: piece.tool("get_file_name"),
  });
}
