'use client';

import { CodeBlock } from '@frogbotai/ui/chat';
import { ThemeProvider } from '@frogbotai/ui/theme';

export default function SystemThemeCheckPage() {
  return (
    <ThemeProvider>
      <CodeBlock code="const status = 'draft';" data-testid="theme-check-user-code" role="user" />
      <CodeBlock code="const status = 'published';" data-testid="theme-check-assistant-code" />
    </ThemeProvider>
  );
}
