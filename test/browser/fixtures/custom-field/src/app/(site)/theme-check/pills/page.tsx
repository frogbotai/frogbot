'use client';

import { OptionPill } from '@frogbotai/ui';
import { ThemeProvider } from '@frogbotai/ui/theme';
import type { OptionColor } from 'frogbot';

const colors = [
  'gray',
  'blue',
  'cyan',
  'teal',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
] satisfies OptionColor[];

export default function OptionPillThemeCheckPage() {
  return (
    <ThemeProvider>
      <div data-testid="theme-check-pills">
        {colors.map((color) => (
          <OptionPill color={color} key={color}>
            {color}
          </OptionPill>
        ))}
      </div>
    </ThemeProvider>
  );
}
