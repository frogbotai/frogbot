import * as module from '@activepieces/piece-file-helper';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const fileHelperActions = ['createFile', 'read_file', 'get_file_name', 'checkFileType', 'change_file_encoding', 'zipFiles', 'unzipFile'] as const;
export const fileHelper = createActivepiecesPiece({ module, service: 'file_helper', credentialType: 'none', defaultActions: fileHelperActions });
