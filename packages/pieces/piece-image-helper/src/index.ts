import { definePiece } from 'frogbot/pieces';

import { compress } from './actions/compress.js';
import { convertFormat } from './actions/convertFormat.js';
import { crop } from './actions/crop.js';
import { getMetadata } from './actions/getMetadata.js';
import { imageToBase64 } from './actions/imageToBase64.js';
import { resize } from './actions/resize.js';
import { rotate } from './actions/rotate.js';

export const createImageHelper = definePiece({
  slug: 'image-helper',
  label: 'Image Helper',
  admin: { description: 'Inspect, transform, and convert images', group: 'Core' },
  actions: [imageToBase64, getMetadata, crop, rotate, resize, compress, convertFormat],
});
