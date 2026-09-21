# @frogbotai/live-preview

Live preview JavaScript SDK for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/live-preview
```

## Usage

```ts
import { ready, subscribe, unsubscribe } from '@frogbotai/live-preview';

export function mountPreview() {
  const subscription = subscribe({
    callback: (data) => {
      document.title = String(data.title);
    },
    initialData: { title: 'Home' },
    serverURL: 'http://localhost:3000',
  });

  ready({ serverURL: 'http://localhost:3000' });

  return () => unsubscribe(subscription);
}
```

Call `mountPreview()` when the browser page mounts. Call its returned cleanup function only when the page unmounts.
