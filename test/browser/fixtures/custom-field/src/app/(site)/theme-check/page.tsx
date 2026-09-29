'use client';

import { Button } from '@frogbotai/ui';
import { ThemeProvider } from '@frogbotai/ui/theme';

export default function ThemeCheckPage() {
  return (
    <ThemeProvider mode="light">
      <Button data-testid="theme-check-default" type="button">
        Approve
      </Button>
    </ThemeProvider>
  );
}
