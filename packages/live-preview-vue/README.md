# @frogbotai/live-preview-vue

Vue SDK for [FrogBot live preview](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/live-preview-vue
```

## Usage

```vue
<script setup lang="ts">
import { useLivePreview } from '@frogbotai/live-preview-vue';

const props = defineProps<{ page: { title: string } }>();
const { data } = useLivePreview({
  initialData: props.page,
  serverURL: 'http://localhost:3000',
});
</script>

<template>
  <h1>{{ data.title }}</h1>
</template>
```
