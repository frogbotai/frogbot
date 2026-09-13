import { definePiece } from 'frogbot/pieces';

import {
  changeFileEncoding,
  checkFileType,
  createFile,
  getFileName,
  readFile,
  unzipFile,
  zipFiles,
} from './actions.js';

export const createFileHelper = definePiece({
  slug: 'file-helper',
  label: 'Files Helper',
  admin: {
    description: 'Create, inspect, convert, compress, and extract files',
    group: 'Core',
  },
  actions: [
    readFile,
    createFile,
    changeFileEncoding,
    checkFileType,
    zipFiles,
    unzipFile,
    getFileName,
  ],
});
