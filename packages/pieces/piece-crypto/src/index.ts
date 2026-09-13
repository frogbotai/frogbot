import { definePiece } from 'frogbot/pieces';

import { decodeBase64 } from './actions/decodeBase64.js';
import { encodeBase64 } from './actions/encodeBase64.js';
import { encryptFile } from './actions/encryptFile.js';
import { generateHmac } from './actions/generateHmac.js';
import { generatePassword } from './actions/generatePassword.js';
import { generateRsaSignature } from './actions/generateRsaSignature.js';
import { hashText } from './actions/hashText.js';

export const createCrypto = definePiece({
  slug: 'crypto',
  label: 'Crypto',
  admin: { description: 'Hash, sign, encode, encrypt, and generate secure values', group: 'Core' },
  actions: [
    hashText,
    generateHmac,
    generateRsaSignature,
    generatePassword,
    decodeBase64,
    encodeBase64,
    encryptFile,
  ],
});
