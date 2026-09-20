# @frogbotai/live-preview-react

React SDK for [FrogBot live preview](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/live-preview-react
```

## Usage

```tsx
'use client';

import { useLivePreview } from '@frogbotai/live-preview-react';

export function PagePreview({ page }) {
  const { data } = useLivePreview({
    initialData: page,
    serverURL: 'http://localhost:3000',
  });

  return <h1>{data.title}</h1>;
}
```
