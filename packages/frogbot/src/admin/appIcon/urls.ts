export const APP_ICON_SIZES = [32, 180, 192, 512] as const;

export type AppIconSize = (typeof APP_ICON_SIZES)[number];

export const appIconURL = (apiRoute: string, size: AppIconSize): string =>
  `${apiRoute}/frogbot/app-icon/${size}`;

export const appManifestURL = (apiRoute: string): string => `${apiRoute}/frogbot/app-manifest`;
