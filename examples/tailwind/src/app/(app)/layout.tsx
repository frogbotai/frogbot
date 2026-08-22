import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'FrogBot Tailwind CSS Example',
  description: 'Tailwind CSS 4 in FrogBot admin components.',
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
