import '@frogbotai/ui/styles.css';

import type { ReactNode } from 'react';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
