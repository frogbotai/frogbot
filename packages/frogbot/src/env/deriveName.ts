export const deriveName = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
