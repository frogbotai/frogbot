# `@frogbotai/piece-csv`

Convert CSV text, JSON arrays, and Excel workbooks without external credentials.

## Usage

```ts
import { createCsv } from '@frogbotai/piece-csv';

export const csv = createCsv();
```

## Actions

| Upstream action slug   | Previous wrapper export | Native action       | Notes                                                                                            |
| ---------------------- | ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `convert_csv_to_json`  | `convertCsvToJson`      | `convertCsvToJson`  | Supports comma- and tab-delimited text, with optional headers.                                   |
| `convert_json_to_csv`  | `convertJsonToCsv`      | `convertJsonToCsv`  | Flattens nested objects into dotted column names.                                                |
| `convert_excel_to_csv` | `convertExcelToCsv`     | `convertExcelToCsv` | Loads `.xlsx` or `.xls` files from the configured files collection and supports sheet selection. |

The upstream piece registers no triggers.
