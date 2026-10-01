import {
  type BrandConfig,
  // @ts-expect-error BrandTheme is no longer exported.
  type BrandTheme,
  ThemeProvider,
  // @ts-expect-error ThemeTokens is no longer exported.
  type ThemeTokens,
  useTheme,
} from '@frogbotai/ui/theme';

export type Removed = [BrandTheme, ThemeTokens];

export const brand: BrandConfig = { icon: null, logo: null, productName: 'Acme' };

export const themed = (
  // @ts-expect-error ThemeProvider no longer accepts theme tokens.
  <ThemeProvider theme={{ '--primary': 'red' }}>
    <div />
  </ThemeProvider>
);

export const branded = (
  // @ts-expect-error ThemeProvider no longer accepts brand tokens.
  <ThemeProvider brand={{ tokens: {} }}>
    <div />
  </ThemeProvider>
);

export const modeOnly = (
  <ThemeProvider mode="dark" onModeChange={() => {}} storageKey="acme-theme">
    <div />
  </ThemeProvider>
);

export function useTokens() {
  // @ts-expect-error useTheme no longer returns tokens.
  return useTheme().tokens;
}
