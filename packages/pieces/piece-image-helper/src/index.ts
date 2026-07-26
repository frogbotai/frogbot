import * as module from '@activepieces/piece-image-helper';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const imageHelperActions = ['image_to_base64', 'get_meta_data', 'crop_image', 'rotate_image', 'resize_image', 'compress_image'] as const;
export const imageHelperScopes = [] as const;

export function createImageHelper(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "image_helper",
    credentialType: "none",
    defaultActions: imageHelperActions,
    scopes: imageHelperScopes,
    config,
  });
  return Object.assign(piece, {
    /** Image to Base64: Converts an image to an url-like Base64 string */
    imageToBase64: piece.tool("image_to_base64"),
    /** Get image metadata: Gets metadata from an image */
    getMetaData: piece.tool("get_meta_data"),
    /** Crop an image: Crops an image */
    cropImage: piece.tool("crop_image"),
    /** Rotate an image: Rotates an image */
    rotateImage: piece.tool("rotate_image"),
    /** Resize an image: Resizes an image */
    resizeImage: piece.tool("resize_image"),
    /** Compresses an image: Compresses an image */
    compressImage: piece.tool("compress_image"),
    /** Image Conversion Helper: Converts a image to supported formats */
    convertImageFormat: piece.tool("convert_image_format"),
  });
}
