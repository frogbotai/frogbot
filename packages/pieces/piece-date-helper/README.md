# `@frogbotai/piece-date-helper`

Manipulate, format, compare, and inspect dates and times in FrogBot workflows.

## Usage

```ts
import { createDateHelper } from '@frogbotai/piece-date-helper';

export const datehelper = createDateHelper();
```

## Actions

| Upstream action slug          | Previous wrapper export   | Native action             | Notes                                         |
| ----------------------------- | ------------------------- | ------------------------- | --------------------------------------------- |
| `get_current_date`            | `getCurrentDate`          | `getCurrentDate`          | Uses the selected time zone and format.       |
| `format_date`                 | `formatDate`              | `formatDate`              | Converts formats and time zones.              |
| `extract_date_parts`          | `extractDateParts`        | `extractDateParts`        | Extracts selected numeric or named parts.     |
| `date_difference`             | `dateDifference`          | `dateDifference`          | Returns selected duration components.         |
| `add_subtract_date`           | `addSubtractDate`         | `addSubtractDate`         | Applies signed year-to-second expressions.    |
| `next_day_of_week`            | `nextDayOfWeek`           | `nextDayOfWeek`           | Finds the next selected weekday and time.     |
| `next_day_of_year`            | `nextDayOfYear`           | `nextDayOfYear`           | Finds the next selected month, day, and time. |
| `first_day_of_previous_month` | `firstDayOfPreviousMonth` | `firstDayOfPreviousMonth` | Uses the selected time and time zone.         |
| `last_day_of_previous_month`  | `lastDayOfPreviousMonth`  | `lastDayOfPreviousMonth`  | Uses the selected time and time zone.         |

The upstream piece registers no triggers.
