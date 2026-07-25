import * as module from '@activepieces/piece-image-helper';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const imageHelperActions = ['image_to_base64', 'get_meta_data', 'crop_image', 'rotate_image', 'resize_image', 'compress_image'] as const;
export const imageHelper = createActivepiecesPiece({ module, service: 'image_helper', credentialType: 'none', defaultActions: imageHelperActions });
