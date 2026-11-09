'use client';

import { CodeBlock } from '@frogbotai/ui/chat';
import { ThemeProvider } from '@frogbotai/ui/theme';

export default function SystemThemeCheckPage() {
  return (
    <ThemeProvider>
      <CodeBlock code="const status = 'draft';" data-testid="theme-check-user-code" role="user" />
      <CodeBlock code="const status = 'published';" data-testid="theme-check-assistant-code" />
      <CodeBlock
        code="const status: string = 'draft';"
        data-testid="theme-check-ts-code"
        language="ts"
      />
      <CodeBlock code="const status = 1;" data-testid="theme-check-plain-code" language="unknown" />
    </ThemeProvider>
  );
}
