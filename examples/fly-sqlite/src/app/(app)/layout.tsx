import '@frogbotai/ui/styles.css';

import { ThemeScript } from '@frogbotai/ui/theme';
import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'FrogBot',
  description: 'A FrogBot app.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
