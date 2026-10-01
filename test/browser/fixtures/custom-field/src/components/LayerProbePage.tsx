'use client';

import { ThemeProvider } from '@frogbotai/ui/theme';

import { LayerProbe } from './LayerProbe';

export function LayerProbePage() {
  return (
    <ThemeProvider mode="light">
      <LayerProbe />
    </ThemeProvider>
  );
}
