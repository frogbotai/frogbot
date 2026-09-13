import { definePiece } from 'frogbot/pieces';

import { addNumbers } from './actions/addNumbers.js';
import { divideNumbers } from './actions/divideNumbers.js';
import { generateRandomNumber } from './actions/generateRandomNumber.js';
import { getRemainder } from './actions/getRemainder.js';
import { multiplyNumbers } from './actions/multiplyNumbers.js';
import { subtractNumbers } from './actions/subtractNumbers.js';

export const createMathHelper = definePiece({
  slug: 'mathHelper',
  label: 'Math Helper',
  admin: { description: 'Perform mathematical operations', group: 'Core' },
  actions: [
    addNumbers,
    subtractNumbers,
    multiplyNumbers,
    divideNumbers,
    getRemainder,
    generateRandomNumber,
  ],
});
