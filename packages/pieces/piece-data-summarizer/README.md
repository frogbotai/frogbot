# `@frogbotai/piece-data-summarizer`

Calculate numeric summaries and count unique values without a configured credential.

## Usage

```ts
import { createDataSummarizer } from '@frogbotai/piece-data-summarizer';

export const dataSummarizer = createDataSummarizer();
```

## Actions

| Upstream action slug | Previous wrapper export | Native action       | Notes                                       |
| -------------------- | ----------------------- | ------------------- | ------------------------------------------- |
| `calculateAverage`   | `calculateAverage`      | `calculateAverage`  | Coerces numeric strings to numbers.         |
| `calculateSum`       | `calculateSum`          | `calculateSum`      | Coerces numeric strings to numbers.         |
| `countUniques`       | `countUniques`          | `countUniqueValues` | Can compare selected fields of each object. |
| `getMinMax`          | `getMinMax`             | `findMinMax`        | Uses a semantic operation name.             |
