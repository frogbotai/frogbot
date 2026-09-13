# `@frogbotai/piece-image-helper`

Inspect, transform, compress, and convert images stored in FrogBot's files collection.

## Usage

```ts
import { createImageHelper } from '@frogbotai/piece-image-helper';

export const imageHelper = createImageHelper();
```

## Actions

| Upstream action slug   | Previous wrapper export | Native action   | Notes                                                          |
| ---------------------- | ----------------------- | --------------- | -------------------------------------------------------------- |
| `image_to_base64`      | `imageToBase64`         | `imageToBase64` | Returns a Base64 data URL.                                     |
| `get_meta_data`        | `getMetaData`           | `getMetadata`   | Returns embedded image metadata.                               |
| `crop_image`           | `cropImage`             | `crop`          | Saves the cropped image to the files collection.               |
| `rotate_image`         | `rotateImage`           | `rotate`        | Saves the clockwise-rotated image to the files collection.     |
| `resize_image`         | `resizeImage`           | `resize`        | Saves the resized image to the files collection.               |
| `compress_image`       | `compressImage`         | `compress`      | Saves a JPEG or PNG to the files collection.                   |
| `convert_image_format` | `convertImageFormat`    | `convertFormat` | Saves a JPEG, PNG, TIFF, BMP, or AVIF to the files collection. |

## Triggers

| Upstream trigger slug | Native trigger | Type | Notes                                     |
| --------------------- | -------------- | ---- | ----------------------------------------- |
| None                  | None           | None | The upstream piece registers no triggers. |
