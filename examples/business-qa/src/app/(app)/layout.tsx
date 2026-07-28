import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Business QA | FrogBot',
  description: 'Release-readiness assistant showcase.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
